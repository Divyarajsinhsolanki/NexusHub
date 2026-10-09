require "combine_pdf"
require "hexapdf"
require "mini_magick"
require "open3"
require "prawn"
require "timeout"
require "zip"

module PdfDocuments
  class Processor
    MAX_SHAPES = 200
    MAX_PEN_POINTS = 2_000
    MAX_REDACTIONS = 100
    MAX_REPLACEMENT_TEXT_LENGTH = 500
    MAX_TEXT_LENGTH = 5_000
    MAX_PAGES = 2_000
    MAX_TEXT_EXTRACTION_PAGES = 500
    MAX_IMAGE_EXPORT_PAGES = 100
    MAX_ARTIFACT_BYTES = 100.megabytes
    REDACTION_MODES = %w[black blank strike replace].freeze

    def initialize(document:, user:, source_version: nil, operation_record: nil)
      @document = document
      @user = user
      @source_version = source_version || document.current_version
      @operation_record = operation_record
    end

    def edit!(kind:, parameters:, base_version_id:, asset: nil, assets: {})
      LayerPipeline.new(document: @document, user: @user, version: @source_version, operation: @operation_record)
        .edit!(kind: kind.to_s, parameters:, base_version_id:, asset:, assets:)
    end

    def protect!(password:, base_version_id:)
      raise ArgumentError, "Unlock this PDF before protecting it again." if @source_version.encrypted?
      validate_password!(password)
      with_source do |source_path|
        with_output do |output_path|
          document = HexaPDF::Document.open(source_path)
          document.encrypt(owner_password: password, user_password: password,
                           algorithm: :aes, key_length: 256)
          document.write(output_path, optimize: true)
          Manager.append_version!(
            document: @document,
            created_by: @user,
            path: output_path,
            operation: "protect",
            edit_state: LayerPipeline.state_for(@source_version),
            operation_record: @operation_record,
            base_version_id:
          )
        end
      end
    end

    def unlock!(password:, base_version_id:)
      with_source do |source_path|
        with_output do |output_path|
          document = HexaPDF::Document.open(source_path, decryption_opts: { password: password })
          document.encrypt(name: nil)
          document.write(output_path, optimize: true)
          Manager.append_version!(
            document: @document,
            created_by: @user,
            path: output_path,
            operation: "unlock",
            edit_state: LayerPipeline.state_for(@source_version),
            operation_record: @operation_record,
            base_version_id:
          )
        end
      end
    rescue HexaPDF::EncryptionError
      raise ArgumentError, "The PDF password is incorrect."
    end

    def compress!(base_version_id:)
      LayerPipeline.new(document: @document, user: @user, version: @source_version, operation: @operation_record)
        .compress!(base_version_id:)
    end

    def extract_text!
      raise ArgumentError, "Unlock this PDF before exporting it." if @source_version&.encrypted?
      validate_page_count!(@source_version&.page_count || @document.page_count, MAX_TEXT_EXTRACTION_PAGES, "Text extraction")

      with_source do |source_path|
        create_artifact!(
          kind: "text",
          filename: "#{File.basename(@document.original_filename, ".pdf")}.txt",
          content_type: "text/plain",
          content: TextExtractor.call(
            source_path,
            max_bytes: TextExtractor::MAX_ARTIFACT_BYTES,
            truncate: false
          )
        )
      end
    end

    def export_images!
      raise ArgumentError, "Unlock this PDF before exporting it." if @source_version&.encrypted?
      validate_page_count!(@source_version&.page_count || @document.page_count, MAX_IMAGE_EXPORT_PAGES, "Image export")

      with_source do |source_path|
        Dir.mktmpdir("pdf-images") do |directory|
          prefix = File.join(directory, "page")
          _stdout, stderr, status = run_command(
            ["pdftoppm", "-cropbox", "-png", "-r", "144", source_path, prefix],
            timeout: 120
          )
          raise ArgumentError, "Image export failed." unless status.success?

          image_paths = self.class.sorted_page_image_paths(Dir.glob("#{prefix}-*.png"))
          raise ArgumentError, "Image export produced no files." if image_paths.empty?

          zip_path = File.join(directory, "images.zip")
          Zip::File.open(zip_path, create: true) do |zip|
            image_paths.each do |path|
              page_number = self.class.page_number_from_image_path(path)
              zip.add("page-#{page_number}.png", path)
            end
          end
          validate_artifact_size!(zip_path)
          create_artifact_from_path!(
            kind: "images",
            path: zip_path,
            filename: "#{File.basename(@document.original_filename, ".pdf")}-images.zip",
            content_type: "application/zip"
          )
        end
      end
    end

    def self.sorted_page_image_paths(paths)
      paths.sort_by { |path| page_number_from_image_path(path) || Float::INFINITY }
    end

    def self.page_number_from_image_path(path)
      File.basename(path).match(/-(\d+)\.png\z/)&.[](1)&.to_i
    end

    def redact!(regions:, base_version_id:)
      LayerPipeline.new(document: @document, user: @user, version: @source_version, operation: @operation_record)
        .redact!(regions:, base_version_id:, processor: self)
    end

    private

    def rasterized_redacted_page(source_path, page_number, regions)
      Dir.mktmpdir("pdf-redaction") do |directory|
        prefix = File.join(directory, "page")
        _stdout, stderr, status = run_command(
          ["pdftoppm", "-cropbox", "-f", page_number.to_s, "-l", page_number.to_s, "-singlefile",
           "-png", "-r", "200", source_path, prefix],
          timeout: 120
        )
        raise ArgumentError, "Redaction rendering failed." unless status.success?

        image_path = "#{prefix}.png"
        image = MiniMagick::Image.open(image_path)
        page_dimensions = PageGeometry.for_page(HexaPDF::Document.open(source_path).pages[page_number - 1]).display_size
        scale_x, scale_y = image.width / page_dimensions[:width], image.height / page_dimensions[:height]
        normalized_regions = regions.map do |region|
          validate_rectangle!(region, page_dimensions, label: "Redaction")
          mode = (region["redaction_mode"] || region[:redaction_mode] || "black").to_s
          raise ArgumentError, "Unsupported redaction style." unless REDACTION_MODES.include?(mode)

          replacement_text = (region["replacement_text"] || region[:replacement_text]).to_s
          if mode == "replace"
            raise ArgumentError, "Replacement text is required." if replacement_text.blank?
            if replacement_text.length > MAX_REPLACEMENT_TEXT_LENGTH
              raise ArgumentError, "Replacement text is too long."
            end
            Editor.new(document: @document, user: @user).validate_text!(replacement_text)
          end

          color = (region["replacement_color"] || region[:replacement_color] || region["color"] || region[:color] || "#111827").to_s
          validate_color!(color)
          font_size = finite_number!(region["font_size"] || region[:font_size] || 14)
          raise ArgumentError, "Replacement font size must be between 6 and 72." unless font_size.between?(6, 72)

          stroke_width = finite_number!(region["stroke_width"] || region[:stroke_width] || 3)
          raise ArgumentError, "Strikethrough width must be between 1 and 12." unless stroke_width.between?(1, 12)

          {
            mode:,
            x: region.fetch("x", region[:x]).to_f,
            y: region.fetch("y", region[:y]).to_f,
            width: region.fetch("width", region[:width]).to_f,
            height: region.fetch("height", region[:height]).to_f,
            replacement_text:,
            color: color.start_with?("#") ? color : "##{color}",
            font_size:,
            stroke_width:
          }
        end
        image.combine_options do |command|
          normalized_regions.each do |region|
            x1 = region[:x] * scale_x
            y1 = region[:y] * scale_y
            x2 = x1 + region[:width] * scale_x
            y2 = y1 + region[:height] * scale_y

            if region[:mode] == "strike"
              command.fill("none")
              command.stroke(region[:color])
              command.strokewidth(region[:stroke_width] * [scale_x, scale_y].min)
              command.draw("line #{x1},#{(y1 + y2) / 2.0} #{x2},#{(y1 + y2) / 2.0}")
            else
              cover_color = region[:mode] == "black" ? "black" : "white"
              command.fill(cover_color)
              command.stroke(cover_color)
              command.strokewidth(1)
              command.draw("rectangle #{x1},#{y1} #{x2},#{y2}")
            end
          end
        end
        image.write(image_path)

        page_width, page_height = page_dimensions.values_at(:width, :height)
        page_pdf = File.join(directory, "page.pdf")
        Prawn::Document.generate(page_pdf, page_size: [page_width, page_height], margin: 0) do |pdf|
          pdf.font(Editor::FONT_PATH)
          pdf.image image_path, at: [0, page_height], width: page_width, height: page_height
          normalized_regions.select { |region| region[:mode] == "replace" }.each do |region|
            padding = 2
            pdf.fill_color(region[:color].delete_prefix("#"))
            pdf.text_box(
              region[:replacement_text],
              at: [region[:x] + padding, page_height - region[:y] - padding],
              width: [region[:width] - (padding * 2), 1].max,
              height: [region[:height] - (padding * 2), 1].max,
              size: region[:font_size],
              min_font_size: 6,
              overflow: :shrink_to_fit,
              valign: :center
            )
          end
        end
        CombinePDF.load(page_pdf).pages.first
      end
    end

    def create_artifact!(kind:, filename:, content_type:, content:)
      Tempfile.create(["pdf-artifact-", File.extname(filename)], binmode: true) do |file|
        file.write(content)
        file.flush
        create_artifact_from_path!(kind:, path: file.path, filename:, content_type:)
      end
    end

    def create_artifact_from_path!(kind:, path:, filename:, content_type:)
      validate_artifact_size!(path)
      blob = File.open(path, "rb") { |io| ActiveStorage::Blob.create_and_upload!(io:, filename:, content_type:, identify: false) }
      artifact = PdfDocumentArtifact.transaction do
        @operation_record&.lock!
        if @operation_record&.status == "completed"
          next @user.pdf_document_artifacts.find(@operation_record.result.fetch("artifact_id"))
        end
        @operation_record&.assert_processing_lease!
        generated = @user.pdf_document_artifacts.create!(workspace: @user.workspace,
          pdf_document: @document, pdf_document_operation: @operation_record, kind:, expires_at: 24.hours.from_now)
        generated.file.attach(blob)
        Manager.complete_operation!(@operation_record, { artifact_id: generated.id })
        generated
      end
      PurgePdfDocumentArtifactsJob.set(wait: 24.hours).perform_later
      artifact
    ensure
      Manager.purge_unattached!(blob)
    end

    def validate_page_count!(page_count, limit, label)
      return if page_count.to_i <= limit

      raise ArgumentError, "#{label} is limited to #{limit} pages."
    end

    def validate_artifact_size!(path)
      return if File.size(path) <= MAX_ARTIFACT_BYTES

      raise ArgumentError, "Generated file is too large."
    end

    def validate_password!(password)
      raise ArgumentError, "Password must be at least 8 characters." if password.to_s.length < 8
    end

    def validate_rectangle!(value, dimensions, label:)
      x = finite_number!(value.fetch(:x, value["x"]))
      y = finite_number!(value.fetch(:y, value["y"]))
      width = finite_number!(value.fetch(:width, value["width"]))
      height = finite_number!(value.fetch(:height, value["height"]))
      raise ArgumentError, "#{label} area is too small." if width < 2 || height < 2
      if x.negative? || y.negative? ||
         x + width > dimensions[:width] + 1 ||
         y + height > dimensions[:height] + 1
        raise ArgumentError, "#{label} area must stay inside the page."
      end
    end

    def validate_color!(color)
      return if color.blank? || color.to_s.match?(/\A#?[0-9a-fA-F]{6}\z/)

      raise ArgumentError, "Annotation color is invalid."
    end

    def finite_number!(value)
      number = Float(value)
      raise ArgumentError, "Coordinates must be finite numbers." unless number.finite?

      number
    rescue TypeError, ArgumentError
      raise ArgumentError, "Coordinates must be valid numbers."
    end

    def with_source(&block)
      raise ArgumentError, "Source PDF version is no longer available. Reload and try again." unless @source_version&.file&.attached?
      @source_version.file.open { |file| block.call(file.path) }
    end

    def with_output
      Tempfile.create(["pdf-output-", ".pdf"], binmode: true) do |file|
        file.close
        yield file.path
      end
    end

    def run_command(command, timeout:)
      Command.capture3(command, timeout:)
    rescue Timeout::Error
      raise ArgumentError, "PDF operation timed out. Try a smaller document."
    end
  end
end
