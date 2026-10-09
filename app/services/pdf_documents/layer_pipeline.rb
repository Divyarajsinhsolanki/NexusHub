module PdfDocuments
  class LayerPipeline
    def initialize(document:, user:, version: nil, operation: nil)
      @document, @user, @operation = document, user, operation
      @editor = Editor.new(document:, user:, version: version || document.current_version)
    end

    def edit!(kind:, parameters:, base_version_id:, assets: {}, asset: nil)
      raise ArgumentError, "Unlock this PDF before editing it." if @editor.version.encrypted?
      params = parameters.deep_stringify_keys
      @editor.with_background do |background|
        case kind
        when "save_objects", "annotations", "image"
          public = kind == "save_objects" ? params.fetch("objects") : @editor.public_objects
          public += Array(params.fetch("shapes")) if kind == "annotations"
          if kind == "image"
            key = SecureRandom.uuid
            public += [params.merge("id" => SecureRandom.uuid, "type" => "image", "asset_id" => key)]
            assets = { key => asset }
          end
          objects, asset_blobs = @editor.canonicalize(public, uploads: assets)
          state = { layer: @editor.layer, background_blob: @editor.background_attachment.blob,
                    geometry: @editor.geometry, objects:, assets: asset_blobs }
          render_and_append!(background, state, kind, base_version_id)
        else
          document = HexaPDF::Document.open(background)
          source_pages = (1..document.pages.count).to_a
          pages = document.pages.to_a
          case kind
          when "reorder_pages"
            order = Array(params.fetch("page_order")).map { |number| Integer(number) }
            raise ArgumentError, "Page order must include each page exactly once." unless order.sort == source_pages
            order.each_with_index { |number, index| document.pages.move(pages[number - 1], index) }
            source_pages = order
          when "delete_pages"
            deleted = page_numbers!(params.fetch("page_numbers"), pages.length)
            raise ArgumentError, "A PDF must keep at least one page." if deleted.length == pages.length
            deleted.sort.reverse_each { |number| document.pages.delete_at(number - 1) }
            source_pages -= deleted
          when "rotate_pages"
            selected = page_numbers!(params.fetch("page_numbers"), pages.length)
            degrees = Integer(params.fetch("degrees"))
            raise ArgumentError, "Rotation must be a multiple of 90 degrees." unless (degrees % 90).zero?
            selected.each { |number| pages[number - 1][:Rotate] = (pages[number - 1][:Rotate].to_i + degrees) % 360 }
          when "duplicate_pages"
            selected = page_numbers!(params.fetch("page_numbers"), pages.length)
            raise ArgumentError, "The result would contain too many pages." if pages.length + selected.length > Processor::MAX_PAGES
            selected.sort.reverse_each do |number|
              document.pages.insert(number, document.import(pages[number - 1]))
              source_pages.insert(number, number)
            end
          when "add_blank_page"
            raise ArgumentError, "The result would contain too many pages." if pages.length >= Processor::MAX_PAGES
            position = Integer(params.fetch("position"))
            raise ArgumentError, "Invalid page position." unless position.between?(1, pages.length + 1)
            reference = Integer(params["reference_page_number"].presence || [position, pages.length].min)
            raise ArgumentError, "Invalid reference page." unless reference.between?(1, pages.length)
            source = pages[reference - 1]
            blank = document.add({ Type: :Page, MediaBox: source.box(:media).value.dup,
                                   CropBox: source.box(:crop).value.dup, Rotate: source[:Rotate].to_i })
            blank[:UserUnit] = source[:UserUnit] if source[:UserUnit]
            document.pages.insert(position - 1, blank)
            source_pages.insert(position - 1, nil)
          when "crop"
            number = Integer(params.fetch("page_number"))
            raise ArgumentError, "Invalid page number." unless number.between?(1, pages.length)
            page = PageGeometry.for_page(pages[number - 1])
            crop = params.slice("x", "y", "width", "height").merge("type" => "rectangle")
            @editor.validate_geometry!(crop, page.display_size, allow_clipped: false)
            corners = [[crop["x"], crop["y"]], [crop["x"] + crop["width"], crop["y"] + crop["height"]]].map { |x, y| page.point(x, y) }
            xs, ys = corners.map(&:first), corners.map(&:last)
            raise ArgumentError, "Crop area is too small." if xs.max - xs.min < 10 || ys.max - ys.min < 10
            pages[number - 1].box(:crop, [xs.min, ys.min, xs.max, ys.max])
          else
            raise ArgumentError, "Unsupported PDF operation."
          end
          objects = Editor.remap_objects(@editor.objects, source_pages)
          write_transformed!(document, objects, kind, base_version_id)
        end
      end
    ensure
      @editor.uploaded_blobs.each { |blob| Manager.purge_unattached!(blob) }
    end

    def compress!(base_version_id:)
      raise ArgumentError, "Unlock this PDF before editing it." if @editor.version.encrypted?
      @editor.with_background do |background|
        write_transformed!(HexaPDF::Document.open(background), @editor.objects, "compress", base_version_id)
      end
    ensure
      @editor.uploaded_blobs.each { |blob| Manager.purge_unattached!(blob) }
    end

    def redact!(regions:, base_version_id:, processor:)
      raise ArgumentError, "Unlock this PDF before editing it." if @editor.version.encrypted?
      raise ArgumentError, "Redaction areas must be an array of objects." unless regions.is_a?(Array) && regions.all? { |region| region.is_a?(Hash) }
      raise ArgumentError, "Too many redaction areas." if regions.length > Processor::MAX_REDACTIONS
      grouped = regions.group_by { |region| Integer(region["page_number"] || region[:page_number]) }
      raise ArgumentError, "Draw at least one redaction area." if grouped.empty?
      @editor.with_background do |background|
        @editor.version.file.open do |source|
          document = HexaPDF::Document.open(background)
          invalid = grouped.keys.any? { |number| !number.between?(1, document.pages.count) }
          raise ArgumentError, "Invalid page number." if invalid
          PageSanitizer.finalize!(document, grouped.keys)
          grouped.each do |number, areas|
            Tempfile.create(["pdf-redacted-page-", ".pdf"]) do |single|
              single.close
              pdf = CombinePDF.new
              pdf << processor.send(:rasterized_redacted_page, source.path, number, areas)
              pdf.save(single.path)
              imported = document.import(HexaPDF::Document.open(single.path).pages[0])
              imported[:UserUnit] = document.pages[number - 1][:UserUnit] if document.pages[number - 1][:UserUnit]
              document.pages.delete_at(number - 1)
              document.pages.insert(number - 1, imported)
            end
          end
          objects = @editor.objects.filter_map do |object|
            if object["type"] == "page_number"
              pages = Array(object["page_numbers"])
              pages = (1..document.pages.count).to_a if pages.empty?
              pages -= grouped.keys
              object.merge("page_numbers" => pages) if pages.any?
            else
              object unless grouped.key?(object["page_number"])
            end
          end
          # Removing a page does not remove its content/resource objects. They
          # must be unreachable in both the new background and composed download.
          document.task(:optimize, compact: true, prune_page_resources: true)
          write_transformed!(document, objects, "redact", base_version_id)
        end
      end
    ensure
      @editor.uploaded_blobs.each { |blob| Manager.purge_unattached!(blob) }
    end

    def self.state_for(version)
      return unless version.edit_layer
      { layer: version.edit_layer, objects: Array(version.metadata["objects"]),
        geometry: version.edit_layer.geometry, assets: version.edit_layer.assets.map(&:blob) }
    end

    def render_and_append!(background, state, kind, base_version_id)
      Tempfile.create(["pdf-composed-", ".pdf"]) do |output|
        output.close
        asset_map = state[:assets].index_by { |blob| blob.metadata["pdf_asset_id"] }
        Editor.render(background_path: background, output_path: output.path, objects: state[:objects], geometry: state[:geometry], assets: asset_map)
        result_metadata = {}
        if kind == "compress"
          original_bytes = @editor.version.file.blob.byte_size
          compressed_bytes = File.size(output.path)
          if compressed_bytes >= original_bytes
            return Manager.complete_without_change!(@operation, @document, base_version_id,
              { original_bytes:, compressed_bytes: original_bytes, message: "This PDF is already optimized. No larger copy was saved." })
          end
          result_metadata = { original_bytes:, compressed_bytes:, message: "PDF reduced by #{((1.0 - compressed_bytes.to_f / original_bytes) * 100).round(1)}%." }
        end
        Manager.append_version!(document: @document, created_by: @user, path: output.path, operation: kind,
          base_version_id:, edit_state: state, operation_record: @operation, result_metadata:)
      end
    end

    def write_transformed!(document, objects, kind, base_version_id)
      raise ArgumentError, "The result contains too many editable objects." if objects.length > Processor::MAX_SHAPES
      raise ArgumentError, "Pen drawing contains too many points." if objects.sum { |object| Array(object["points"]).length } > Processor::MAX_PEN_POINTS
      Tempfile.create(["pdf-editor-background-", ".pdf"]) do |background|
        background.close
        document.write(background.path, optimize: true)
        Inspector.call(background.path)
        blob = Manager.upload_pdf!(background.path, "editor-background.pdf")
        @editor.uploaded_blobs << blob
        geometry = document.pages.map { |page| PageGeometry.for_page(page).as_json }
        keys = objects.filter_map { |object| object["asset_id"] }.uniq
        assets = @editor.layer ? @editor.layer.asset_map.slice(*keys).values.map(&:blob) : []
        state = { background_blob: blob, geometry:, objects:, assets: }
        render_and_append!(background.path, state, kind, base_version_id)
      end
    end

    def page_numbers!(values, count)
      pages = Array(values).map { |value| Integer(value) }.uniq
      raise ArgumentError, "Choose at least one page." if pages.empty?
      raise ArgumentError, "One or more page numbers are invalid." unless pages.all? { |page| page.between?(1, count) }
      pages
    end
  end
end
