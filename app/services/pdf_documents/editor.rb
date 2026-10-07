require "hexapdf"
require "prawn"
require "mini_magick"
require "securerandom"
require "stringio"

module PdfDocuments
  # The background never includes these objects. Every version contains a full
  # snapshot, allowing edits and undo without accumulating flattened overlays.
  class Editor
    TYPES = %w[text watermark highlight rectangle arrow pen strike strikethrough image signature stamp page_number].freeze
    IMAGE_TYPES = %w[image signature stamp].freeze
    FIELDS = %w[id type page_number x y x2 y2 width height text color fill_color stroke_width
                opacity font_size rotation points asset_id position start_number format page_numbers margin].freeze
    POSITIONS = %w[top-left top-center top-right bottom-left bottom-center bottom-right].freeze
    FORMATS = %w[number page_number page_of_total].freeze
    FONT_PATH = Rails.root.join("app/assets/fonts/pdf/DejaVuSans.ttf").to_s
    BOLD_FONT_PATH = Rails.root.join("app/assets/fonts/pdf/DejaVuSans-Bold.ttf").to_s

    attr_reader :version, :layer, :objects, :geometry, :uploaded_blobs

    def initialize(document:, user:, version: nil)
      @document, @user = document, user
      @version = version || document.current_version
      @layer = @version&.edit_layer
      @objects = Array(@version&.metadata&.dig("objects")).deep_dup
      @geometry = @layer&.geometry
      @uploaded_blobs = []
    end

    def background_attachment
      layer&.background&.attached? ? layer.background : version.file
    end

    def with_background
      background_attachment.open do |file|
        @geometry ||= PageGeometry.read(file.path)
        yield file.path
      end
    end

    def public_objects
      objects.map { |object| self.class.display_object(object, geometry) }
    end

    def self.display_object(raw, geometry)
      object = raw.deep_stringify_keys
      result = object.slice(*FIELDS)
      return result if object["type"] == "page_number" || !object["_matrix"]

      current = PageGeometry.new(**geometry.fetch(object.fetch("page_number").to_i - 1).symbolize_keys)
      transform = PageGeometry.multiply(PageGeometry.inverse(current.matrix), object["_matrix"])
      case object["type"]
      when "pen"
        result["points"] = Array(object["points"]).map do |point|
          x, y = PageGeometry.point(transform, point["x"], point["y"])
          { "x" => x, "y" => y }
        end
      when "arrow"
        result["x"], result["y"] = PageGeometry.point(transform, object["x"], object["y"])
        result["x2"], result["y2"] = PageGeometry.point(transform, object["x2"], object["y2"])
      else
        width, height = object.values_at("width", "height").map(&:to_f)
        x, y = PageGeometry.point(transform, object["x"].to_f + width / 2, object["y"].to_f + height / 2)
        result["x"], result["y"] = x - width / 2, y - height / 2
        angle = Math.atan2(transform[1], transform[0]) * 180 / Math::PI
        result["rotation"] = (object.fetch("rotation", 0).to_f + angle) % 360
      end
      result
    end

    def canonicalize(raw_objects, uploads: {})
      raise ArgumentError, "Objects must be an array." unless raw_objects.is_a?(Array)
      raise ArgumentError, "Too many editable objects (maximum 200)." if raw_objects.length > Processor::MAX_SHAPES
      raise ArgumentError, "Image uploads must be an object." unless uploads.is_a?(Hash)
      uploads = uploads.stringify_keys
      raise ArgumentError, "Too many uploaded images (maximum 20)." if uploads.length > 20
      uploads.each_value { |file| validate_image!(file) }
      raise ArgumentError, "Combined image uploads must be 50MB or smaller." if uploads.values.sum { |file| file.size.to_i } > 50.megabytes
      assets = layer ? layer.asset_map.transform_values(&:blob) : {}
      uploads.each do |key, file|
        raise ArgumentError, "Image asset identifier is invalid." unless key.match?(/\A[\w-]{1,128}\z/)
        raise ArgumentError, "Use a new identifier when replacing an image." if assets.key?(key)
        File.open(file.path, "rb") do |io|
          blob = ActiveStorage::Blob.create_and_upload!(io:, filename: file.respond_to?(:original_filename) ? file.original_filename : "image.png",
            content_type: file.content_type, identify: false, metadata: { pdf_asset_id: key })
          uploaded_blobs << blob
          assets[key] = blob
        end
      end
      ids = []
      point_count = 0
      previous = public_objects.index_by { |object| object["id"] }
      normalized = raw_objects.map do |raw|
        raise ArgumentError, "Each editable object must be an object." unless raw.is_a?(Hash)
        object = raw.deep_stringify_keys.slice(*FIELDS)
        object["id"] = object["id"].presence || SecureRandom.uuid
        raise ArgumentError, "Object identifier is invalid." unless object["id"].is_a?(String) && object["id"].match?(/\A[\w-]{1,128}\z/)
        raise ArgumentError, "Object identifiers must be unique." if ids.include?(object["id"])
        ids << object["id"]
        raise ArgumentError, "Unsupported editable object type." unless TYPES.include?(object["type"])
        validate_style!(object)
        if object["type"] == "page_number"
          validate_number_rule!(object)
          next object
        end
        page_number = Integer(object.fetch("page_number"))
        raise ArgumentError, "Invalid page number." unless page_number.between?(1, geometry.length)
        object["page_number"] = page_number
        page = PageGeometry.new(**geometry[page_number - 1].symbolize_keys)
        prior = previous[object["id"]]
        prior = nil unless prior && prior["page_number"] == page_number && prior["type"] == object["type"]
        points = validate_geometry!(object, page.display_size, allow_clipped: prior.present?)
        if prior
          prior_points = validate_geometry!(prior.deep_dup, page.display_size, allow_clipped: true)
          if clipping_overflow(points, page.display_size) > clipping_overflow(prior_points, page.display_size) + 0.01
            raise ArgumentError, "Object must stay inside the page."
          end
        end
        if %w[text watermark].include?(object["type"])
          raise ArgumentError, "Annotation text must be text." unless object["text"].is_a?(String)
          raise ArgumentError, "Annotation text is required." if object["text"].blank?
          raise ArgumentError, "Annotation text is too long." if object["text"].to_s.length > Processor::MAX_TEXT_LENGTH
          validate_text!(object["text"])
        elsif IMAGE_TYPES.include?(object["type"])
          object["asset_id"] = object["asset_id"].to_s
          raise ArgumentError, "Choose an image for this object." unless assets[object["asset_id"]]
        end
        point_count += Array(object["points"]).length
        object.merge("_matrix" => page.matrix, "_display_size" => page.display_size.stringify_keys)
      end
      raise ArgumentError, "Pen drawing contains too many points." if point_count > Processor::MAX_PEN_POINTS
      used_keys = normalized.filter_map { |object| object["asset_id"] }.uniq
      unused_uploads = uploads.keys - used_keys
      raise ArgumentError, "An uploaded image is not used by any object." if unused_uploads.any?
      [normalized, used_keys.map { |key| assets.fetch(key) }]
    end

    def validate_image!(file)
      raise ArgumentError, "Choose a PNG or JPG image." unless file.respond_to?(:path) && file.respond_to?(:size) && file.respond_to?(:content_type)
      raise ArgumentError, "Image must be 10MB or smaller." if file.size.to_i > 10.megabytes
      raise ArgumentError, "Image must be a PNG or JPG." unless %w[image/png image/jpeg].include?(file.content_type.to_s)
      image = MiniMagick::Image.open(file.path)
      raise ArgumentError, "Image must be a valid PNG or JPG." unless %w[PNG JPEG JPG].include?(image.type)
      raise ArgumentError, "Image dimensions must be between 8px and 4000px." unless [image.width, image.height].all? { |size| size.between?(8, 4000) }
    rescue MiniMagick::Error
      raise ArgumentError, "Image could not be read. Choose a valid PNG or JPG."
    end

    def validate_style!(object)
      %w[color fill_color].each do |key|
        value = object[key]
        raise ArgumentError, "Annotation color is invalid." if value.present? && !value.to_s.match?(/\A#?[\da-fA-F]{6}\z/)
      end
      { "font_size" => 6..96, "stroke_width" => 0.5..24, "opacity" => 0..1, "rotation" => -360..360 }.each do |key, range|
        if object[key].blank?
          object.delete(key)
          next
        end
        object[key] = number!(object[key])
        raise ArgumentError, "#{key.humanize} is outside its supported range." unless range.cover?(object[key])
      end
      object["color"] = object["color"].presence || (%w[text watermark page_number].include?(object["type"]) ? "#111827" : "#dc2626")
    end

    def validate_geometry!(object, size, allow_clipped:)
      points = case object["type"]
      when "pen"
        raise ArgumentError, "Pen drawing needs at least two points." unless object["points"].is_a?(Array) && object["points"].length >= 2
        raise ArgumentError, "Pen drawing contains too many points." if object["points"].length > Processor::MAX_PEN_POINTS
        object["points"] = object["points"].map do |point|
          raise ArgumentError, "Pen points must be coordinate objects." unless point.is_a?(Hash)
          { "x" => number!(point.fetch("x")), "y" => number!(point.fetch("y")) }
        end
        coordinates = object["points"].map { |point| point.values_at("x", "y") }
        xs, ys = coordinates.map(&:first), coordinates.map(&:last)
        raise ArgumentError, "Pen drawing is too small." if xs.max - xs.min < 2 && ys.max - ys.min < 2
        coordinates
      when "arrow"
        %w[x y x2 y2].each { |key| object[key] = number!(object.fetch(key)) }
        raise ArgumentError, "Arrow is too small." if Math.hypot(object["x2"] - object["x"], object["y2"] - object["y"]) < 2
        [[object["x"], object["y"]], [object["x2"], object["y2"]]]
      else
        %w[x y width height].each { |key| object[key] = number!(object.fetch(key)) }
        raise ArgumentError, "Object area is too small." if object["width"] < 2 || object["height"] < 2
        cx, cy = object["x"] + object["width"] / 2, object["y"] + object["height"] / 2
        angle = object.fetch("rotation", 0).to_f * Math::PI / 180
        [-1, 1].product([-1, 1]).map do |sx, sy|
          dx, dy = sx * object["width"] / 2, sy * object["height"] / 2
          [cx + dx * Math.cos(angle) - dy * Math.sin(angle), cy + dx * Math.sin(angle) + dy * Math.cos(angle)]
        end
      end
      points.each do |x, y|
        raise ArgumentError, "Object coordinates are too large." if x.abs > 100_000 || y.abs > 100_000
        next if allow_clipped
        raise ArgumentError, "Object must stay inside the page." unless x.between?(-1, size[:width] + 1) && y.between?(-1, size[:height] + 1)
      end
    end

    def validate_number_rule!(object)
      object["position"] ||= "bottom-center"
      object["format"] ||= "page_of_total"
      object["start_number"] = Integer(object.fetch("start_number", 1))
      object["margin"] = number!(object.fetch("margin", 24))
      raise ArgumentError, "Page number position is invalid." unless POSITIONS.include?(object["position"])
      raise ArgumentError, "Page number format is invalid." unless FORMATS.include?(object["format"]) || object["format"] == "Page {n} of {total}"
      raise ArgumentError, "Start number must be between 0 and 999999." unless object["start_number"].between?(0, 999_999)
      raise ArgumentError, "Page number margin must be between 0 and 100 points." unless object["margin"].between?(0, 100)
      pages = Array(object["page_numbers"]).map { |page| Integer(page) }.uniq
      raise ArgumentError, "Page number pages are invalid." unless pages.all? { |page| page.between?(1, geometry.length) }
      object["page_numbers"] = pages
      object["font_size"] ||= 12
      object["color"] ||= "#111827"
    end

    def clipping_overflow(points, size)
      points.sum { |x, y| [-x - 1, 0].max + [x - size[:width] - 1, 0].max + [-y - 1, 0].max + [y - size[:height] - 1, 0].max }
    end

    def number!(value)
      value = Float(value)
      raise ArgumentError, "Coordinates must be finite numbers." unless value.finite?
      value
    rescue TypeError
      raise ArgumentError, "Coordinates must be valid numbers."
    end

    def validate_text!(text)
      @validation_font ||= begin
        pdf = Prawn::Document.new
        pdf.font(BOLD_FONT_PATH)
        pdf.font
      end
      unsupported = text.to_s.each_char.reject { |character| character.match?(/\s/) || @validation_font.glyph_present?(character) }.uniq
      raise ArgumentError, "This font does not support: #{unsupported.first(8).join}. Use supported characters." if unsupported.any?
    end

    def self.render(background_path:, output_path:, objects:, geometry:, assets:)
      document = HexaPDF::Document.open(background_path)
      expanded = objects.flat_map do |object|
        if object["type"] == "page_number"
          pages = Array(object["page_numbers"])
          pages = (1..document.pages.count).to_a if pages.empty?
          pages.map { |number| number_shape(object, number, document.pages.count, geometry[number - 1]) }
        else
          object
        end
      end
      asset_paths = {}
      asset_handles = []
      assets.each do |key, blob|
        file = Tempfile.new(["pdf-editor-asset-", File.extname(blob.filename.to_s)], binmode: true)
        blob.download { |chunk| file.write(chunk) }
        file.flush
        asset_handles << file
        asset_paths[key] = file.path
      end
      expanded.group_by { |object| [object.fetch("page_number"), object["_matrix"], object["_display_size"]] }.each do |(number, matrix, size), page_objects|
        raise ArgumentError, "Invalid object page." unless number.to_i.between?(1, document.pages.count)
        height, width = size.fetch("height"), size.fetch("width")
        overlay = Prawn::Document.new(page_size: [width, height], margin: 0)
        page_objects.each { |object| draw(overlay, object, height, asset_paths) }
        overlay_document = HexaPDF::Document.new(io: StringIO.new(overlay.render))
        xobject = document.import(overlay_document.pages[0].to_form_xobject)
        transform = PageGeometry.multiply(matrix, [1, 0, 0, -1, 0, height])
        canvas = document.pages[number - 1].canvas(type: :overlay, translate_origin: false)
        canvas.save_graphics_state do
          canvas.transform(*transform)
          canvas.xobject(xobject, at: [0, 0])
        end
      end
      document.write(output_path, optimize: true)
    ensure
      asset_handles&.each(&:close!)
    end

    def self.number_shape(rule, number, total, raw_geometry)
      page = PageGeometry.new(**raw_geometry.symbolize_keys)
      size = page.display_size
      margin = [rule.fetch("margin", 24).to_f, size[:width] / 4, size[:height] / 4].min
      font_size = rule.fetch("font_size", 12).to_f
      width, height = [200, size[:width] - margin * 2].min, [font_size * 1.8, size[:height] - margin * 2].min
      horizontal, vertical = rule.fetch("position", "bottom-center").split("-").reverse
      x = case horizontal
          when "left" then margin
          when "right" then size[:width] - margin - width
          else (size[:width] - width) / 2
          end
      y = vertical == "top" ? margin : size[:height] - margin - height
      n = rule.fetch("start_number", 1).to_i + number - 1
      text = case rule.fetch("format", "page_of_total")
             when "number" then n.to_s
             when "page_number" then "Page #{n}"
             else "Page #{n} of #{total}"
             end
      rule.merge("type" => "text", "page_number" => number, "x" => x, "y" => y,
        "width" => width, "height" => height, "text" => text, "font_size" => font_size,
        "_number_rule" => true, "_align" => horizontal, "_matrix" => page.matrix, "_display_size" => size.stringify_keys)
    end

    def self.draw(pdf, object, page_height, assets)
      object = object.symbolize_keys
      pdf.save_graphics_state do
        rotation = object[:rotation].to_f
        origin = [object[:x].to_f + object[:width].to_f / 2, page_height - object[:y].to_f - object[:height].to_f / 2]
        pdf.rotate(-rotation, origin:) do
          pdf.stroke_color(object.fetch(:color, "#dc2626").delete_prefix("#"))
          pdf.line_width(object.fetch(:stroke_width, 3).to_f)
          case object[:type]
          when "text", "watermark"
            pdf.font(object[:_number_rule] ? FONT_PATH : BOLD_FONT_PATH)
            pdf.fill_color(object.fetch(:color, "#111827").delete_prefix("#"))
            pdf.transparent(object.fetch(:opacity, object[:type] == "watermark" ? 0.25 : 1).to_f) do
              pdf.text_box(object[:text].to_s, at: [object[:x].to_f + 4, page_height - object[:y].to_f - 4],
                width: [object[:width].to_f - 8, 1].max, height: [object[:height].to_f - 8, 1].max,
                size: object.fetch(:font_size, 16).to_f, leading: object.fetch(:font_size, 16).to_f * 0.15,
                align: object[:_align] == "left" ? :left : object[:_align] == "right" ? :right : object[:_number_rule] ? :center : :left,
                overflow: :shrink_to_fit, min_font_size: 6, kerning: false)
            end
          when "image", "signature", "stamp"
            pdf.transparent(object.fetch(:opacity, 1).to_f) do
              pdf.image(assets.fetch(object[:asset_id]), at: [object[:x].to_f, page_height - object[:y].to_f],
                fit: [object[:width].to_f, object[:height].to_f])
            end
          when "highlight", "rectangle"
            fill = object[:fill_color].presence || (object[:type] == "highlight" ? "#fde047" : nil)
            pdf.fill_color(fill.delete_prefix("#")) if fill
            pdf.transparent(object.fetch(:opacity, object[:type] == "highlight" ? 0.35 : 1).to_f) do
              at = [object[:x].to_f, page_height - object[:y].to_f]
              if object[:type] == "highlight"
                pdf.fill_rectangle(at, object[:width], object[:height])
              elsif fill
                pdf.fill_and_stroke_rectangle(at, object[:width], object[:height])
              else
                pdf.stroke_rectangle(at, object[:width], object[:height])
              end
            end
          when "strike", "strikethrough"
            pdf.transparent(object.fetch(:opacity, 1).to_f) do
              y = page_height - object[:y].to_f - object[:height].to_f / 2
              pdf.stroke_line([object[:x], y], [object[:x] + object[:width], y])
            end
          when "arrow"
            pdf.transparent(object.fetch(:opacity, 1).to_f) do
              x1, y1, x2, y2 = object[:x].to_f, page_height - object[:y].to_f, object[:x2].to_f, page_height - object[:y2].to_f
              pdf.cap_style(:round)
              pdf.stroke_line([x1, y1], [x2, y2])
              angle = Math.atan2(y2 - y1, x2 - x1)
              length = [object.fetch(:stroke_width, 3).to_f * 4, 10].max
              pdf.fill_color(object.fetch(:color, "#dc2626").delete_prefix("#"))
              pdf.fill_polygon([x2, y2], [x2 - length * Math.cos(angle - Math::PI / 6), y2 - length * Math.sin(angle - Math::PI / 6)],
                [x2 - length * Math.cos(angle + Math::PI / 6), y2 - length * Math.sin(angle + Math::PI / 6)])
            end
          when "pen"
            pdf.transparent(object.fetch(:opacity, 1).to_f) do
              points = object[:points].map { |point| [point["x"], page_height - point["y"]] }
              pdf.cap_style(:round)
              pdf.join_style(:round)
              pdf.stroke do
                pdf.move_to(points.first)
                points.drop(1).each { |point| pdf.line_to(point) }
              end
            end
          end
        end
      end
    end

    def self.remap_objects(objects, source_pages, clone_ids: false)
      objects.flat_map do |object|
        if object["type"] == "page_number"
          selected = Array(object["page_numbers"])
          selected = source_pages.uniq if selected.empty?
          mapped = source_pages.each_index.filter_map { |index| index + 1 if selected.include?(source_pages[index]) }
          next [] if mapped.empty?
          [object.merge("id" => clone_ids ? SecureRandom.uuid : object["id"], "page_numbers" => mapped)]
        else
          matching = source_pages.each_index.select { |index| source_pages[index] == object["page_number"] }
          matching.map.with_index do |index, copy|
            object.merge("page_number" => index + 1, "id" => clone_ids || copy.positive? ? SecureRandom.uuid : object["id"])
          end
        end
      end
    end
  end
end
