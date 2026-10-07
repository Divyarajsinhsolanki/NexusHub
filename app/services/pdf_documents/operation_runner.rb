require "hexapdf"
require "stringio"

module PdfDocuments
  class OperationRunner
    ASYNC_KINDS = %w[compress extract_text export_images redact merge extract_pages split_by_size split_by_ranges].freeze
    EDIT_KINDS = %w[reorder_pages delete_pages rotate_pages duplicate_pages add_blank_page crop annotations image save_objects].freeze
    ALLOWED_KINDS = (ASYNC_KINDS + EDIT_KINDS + %w[protect unlock]).freeze

    def initialize(operation)
      @operation = operation
      @user = operation.user
      @document = operation.pdf_document
      @parameters = operation.parameters.deep_symbolize_keys
      @staged_blobs = []
    end

    def run!(password: nil, asset: nil, assets: {})
      already_completed = @operation.with_lock do
        if %w[processing completed failed].include?(@operation.status)
          true
        else
          @operation.update!(status: "processing", progress: 15, started_at: Time.current, error_message: nil)
          false
        end
      end
      return @operation.result if already_completed
      @captured_sources = Sources.resolve(@operation)
      @source_version = @captured_sources.first || @operation.base_version if @document
      if @document && (!@source_version || @source_version.pdf_document_id != @document.id)
        raise ArgumentError, "Source PDF version is no longer available. Reload and try again."
      end
      if @document && (EDIT_KINDS + %w[protect unlock compress redact]).include?(@operation.kind) && @document.current_version_id != @source_version.id
        raise Manager::StaleVersion, "Document changed in another request. Reload and try again."
      end
      result = execute(password:, asset:, assets:)
      @operation.reload
      raise "PDF output was not published." unless @operation.status == "completed"
      result
    rescue StandardError => e
      @operation.with_lock do
        unless @operation.status == "completed"
          @operation.update!(status: "failed", progress: 100, completed_at: Time.current, error_message: e.message.to_s.first(500))
        end
      end
      raise
    ensure
      @staged_blobs.each { |blob| Manager.purge_unattached!(blob) }
      Sources.release!(@operation) if @operation.persisted?
    end

    private

    def execute(password:, asset:, assets:)
      case @operation.kind
      when *EDIT_KINDS
        processor.edit!(kind: @operation.kind, parameters: @parameters, base_version_id: @source_version.id, asset:, assets:)
        @document.reload
      when "protect"
        processor.protect!(password:, base_version_id: @source_version.id)
        @document.reload
      when "unlock"
        processor.unlock!(password:, base_version_id: @source_version.id)
        @document.reload
      when "compress"
        processor.compress!(base_version_id: @source_version.id)
        @document.reload
      when "extract_text" then processor.extract_text!
      when "export_images" then processor.export_images!
      when "redact"
        raise ArgumentError, "Confirm redaction before applying it." unless @parameters[:confirmed] == true
        processor.redact!(regions: @parameters.fetch(:regions), base_version_id: @source_version.id)
        @document.reload
      when "merge" then merge_documents!
      when "extract_pages"
        pages = page_numbers!(@parameters.fetch(:page_numbers), @source_version.page_count).sort
        derive_documents!([{ version: @source_version, pages: }], [{ filename: "#{stem}-pages.pdf", title: "#{@document.title} pages" }])
      when "split_by_ranges"
        ranges = parse_ranges(@parameters[:page_groups] || @parameters[:ranges] || @parameters[:page_ranges], @source_version.page_count)
        split_documents!(ranges)
      when "split_by_size"
        maximum = (@parameters.fetch(:max_size_mb, 10).to_f * 1.megabyte).to_i
        raise ArgumentError, "Split size must be between 1MB and 50MB." unless maximum.between?(1.megabyte, 50.megabytes)
        ranges = size_ranges(maximum)
        split_documents!(ranges, maximum:)
      else raise ArgumentError, "Unsupported PDF operation."
      end
    end

    def processor
      @processor ||= Processor.new(document: @document, user: @user, source_version: @source_version, operation_record: @operation)
    end

    def merge_documents!
      sources = if @captured_sources.any?
        @captured_sources.map { |version| { version:, pages: (1..version.page_count.to_i).to_a } }
      else
        Array(@parameters.fetch(:source_versions)).map do |source|
        document = @user.pdf_documents.find(source.fetch(:document_id))
        version = document.versions.find(source.fetch(:version_id))
        { version:, pages: (1..version.page_count.to_i).to_a }
        end
      end
      raise ArgumentError, "Choose at least two documents." if sources.length < 2
      title = @parameters[:title].presence || "Merged document"
      derive_documents!(sources, [{ filename: "#{title}.pdf", title: }], merge: true)
    end

    def split_documents!(ranges, maximum: nil)
      raise ArgumentError, "Split would create more than 25 files." if ranges.length > 25
      raise ArgumentError, "Choose at least two ranges to split." if ranges.length < 2
      outputs = ranges.each_index.map { |index| { filename: "#{stem}-part-#{index + 1}.pdf", title: "#{@document.title} part #{index + 1}" } }
      derive_documents!(ranges.map { |pages| { version: @source_version, pages: } }, outputs, maximum:)
    end

    def derive_documents!(sources, labels, merge: false, maximum: nil)
      raise ArgumentError, "Unlock encrypted PDFs before using this tool." if sources.any? { |source| source[:version].encrypted? }
      total = merge ? sources.sum { |source| source[:pages].length } : sources.map { |source| source[:pages].length }.max
      raise ArgumentError, "The result would contain too many pages." if total.to_i > Processor::MAX_PAGES
      Dir.mktmpdir("pdf-derived-documents") do |directory|
        source_documents = {}
        source_editors = {}
        sources.each do |source|
          version = source[:version]
          next if source_documents.key?(version.id)
          editor = Editor.new(document: version.pdf_document, user: @user, version:)
          editor.with_background do |path|
            source_documents[version.id] = HexaPDF::Document.open(path)
            source_editors[version.id] = editor
          end
        end
        groups = merge ? [sources] : sources.map { |source| [source] }
        outputs = groups.each_with_index.map do |group, index|
          background = HexaPDF::Document.new
          objects = []
          assets = {}
          group.each do |source|
            editor = source_editors.fetch(source[:version].id)
            offset = background.pages.count
            source[:pages].each { |number| background.pages.add(background.import(source_documents.fetch(source[:version].id).pages[number - 1])) }
            asset_keys = {}
            editor.layer&.asset_map&.each do |key, attachment|
              existing = assets[key]
              if existing && existing.id != attachment.blob.id
                original = attachment.blob
                clone = original.open do |file|
                  ActiveStorage::Blob.create_and_upload!(io: file, filename: original.filename, content_type: original.content_type,
                    identify: false, metadata: original.metadata.merge("pdf_asset_id" => SecureRandom.uuid))
                end
                @staged_blobs << clone
                asset_keys[key] = clone.metadata["pdf_asset_id"]
                assets[asset_keys[key]] = clone
              else
                asset_keys[key] = key
                assets[key] = attachment.blob
              end
            end
            Editor.remap_objects(editor.objects, source[:pages], clone_ids: true).each do |object|
              object["asset_id"] = asset_keys.fetch(object["asset_id"]) if object["asset_id"]
              if object["type"] == "page_number"
                object["page_numbers"] = object["page_numbers"].map { |number| number + offset }
              else
                object["page_number"] += offset
              end
              objects << object
            end
          end
          raise ArgumentError, "The result contains too many editable objects." if objects.length > Processor::MAX_SHAPES
          raise ArgumentError, "Pen drawing contains too many points." if objects.sum { |object| Array(object["points"]).length } > Processor::MAX_PEN_POINTS
          geometry = background.pages.map { |page| PageGeometry.for_page(page).as_json }
          base_path = File.join(directory, "background-#{index}.pdf")
          output_path = File.join(directory, "output-#{index}.pdf")
          background.write(base_path, optimize: true)
          keys = objects.filter_map { |object| object["asset_id"] }.uniq
          assets = assets.slice(*keys)
          Editor.render(background_path: base_path, output_path:, objects:, geometry:, assets:)
          raise ArgumentError, "At least one page is larger than the selected split size." if maximum && File.size(output_path) > maximum
          blob = Manager.upload_pdf!(base_path, "editor-background.pdf")
          @staged_blobs << blob
          labels[index].merge(path: output_path, edit_state: { background_blob: blob, objects:, geometry:, assets: assets.values })
        end
        Manager.publish_documents!(user: @user, outputs:, operation: @operation.kind, operation_record: @operation)
      end
    end

    def parse_ranges(value, count)
      tokens = value.is_a?(String) ? value.split(",", -1).map(&:strip) : Array(value)
      raise ArgumentError, "Enter page ranges such as 1-3,4-6." if tokens.empty?
      used = []
      tokens.map do |token|
        pages = if token.is_a?(Array)
          token.map { |number| Integer(number) }
        elsif token.is_a?(Hash)
          first, last = Integer(token.fetch(:from, token[:start])), Integer(token.fetch(:to, token[:end]))
          raise ArgumentError, "Page range starts after its end." if first > last
          raise ArgumentError, "Page range is outside the PDF." unless first.between?(1, count) && last.between?(1, count)
          (first..last).to_a
        else
          match = token.to_s.match(/\A(\d+)(?:\s*-\s*(\d+))?\z/)
          raise ArgumentError, "Enter valid page ranges such as 1-3,4-6." unless match
          first, last = match[1].to_i, (match[2] || match[1]).to_i
          raise ArgumentError, "Page range starts after its end." if first > last
          raise ArgumentError, "Page range is outside the PDF." unless first.between?(1, count) && last.between?(1, count)
          (first..last).to_a
        end
        pages = page_numbers!(pages, count)
        raise ArgumentError, "Split page ranges must not overlap." if (used & pages).any?
        used.concat(pages)
        pages
      end
    end

    def size_ranges(maximum)
      raise ArgumentError, "Unlock encrypted PDFs before splitting." if @source_version.encrypted?
      @source_version.file.open do |source|
        pdf = HexaPDF::Document.open(source.path)
        groups, current = [], []
        pdf.pages.each_with_index do |page, index|
          candidate = HexaPDF::Document.new
          (current + [index + 1]).each { |number| candidate.pages.add(candidate.import(pdf.pages[number - 1])) }
          io = StringIO.new
          candidate.write(io, optimize: true)
          if current.any? && io.string.bytesize > maximum
            groups << current
            current = []
          end
          current << index + 1
        end
        groups << current if current.any?
        raise ArgumentError, "The document is already below the selected split size." if groups.length < 2
        groups
      end
    end

    def page_numbers!(values, count)
      pages = Array(values).map { |value| Integer(value) }.uniq
      raise ArgumentError, "Choose at least one page." if pages.empty?
      raise ArgumentError, "One or more page numbers are invalid." unless pages.all? { |number| number.between?(1, count.to_i) }
      pages
    end

    def stem
      File.basename(@document.original_filename, ".pdf")
    end
  end
end
