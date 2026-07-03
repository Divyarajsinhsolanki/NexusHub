require "combine_pdf"

module PdfDocuments
  class OperationRunner
    ASYNC_KINDS = %w[
      compress
      extract_text
      export_images
      redact
      merge
      extract_pages
      split_by_size
    ].freeze

    EDIT_KINDS = %w[
      reorder_pages
      delete_pages
      rotate_pages
      duplicate_pages
      add_blank_page
      crop
      annotations
      image
    ].freeze

    ALLOWED_KINDS = (ASYNC_KINDS + EDIT_KINDS + %w[protect unlock]).freeze

    def initialize(operation)
      @operation = operation
      @user = operation.user
      @document = operation.pdf_document
      @parameters = operation.parameters.deep_symbolize_keys
    end

    def run!(password: nil, asset: nil)
      @operation.update!(status: "processing", progress: 10, started_at: Time.current)
      @operation.update!(progress: 35)
      result = execute(password:, asset:)
      @operation.update!(progress: 90)
      @operation.update!(
        status: "completed",
        progress: 100,
        completed_at: Time.current,
        result: normalize_result(result)
      )
      result
    rescue StandardError => e
      @operation.update!(
        status: "failed",
        progress: 100,
        completed_at: Time.current,
        error_message: e.message.to_s.first(500)
      )
      raise
    end

    private

    def execute(password:, asset:)
      case @operation.kind
      when *EDIT_KINDS
        processor.edit!(
          kind: @operation.kind,
          parameters: @parameters,
          base_version_id: @operation.base_version_id,
          asset:
        )
        @document.reload
      when "protect"
        processor.protect!(password:, base_version_id: @operation.base_version_id)
        @document.reload
      when "unlock"
        processor.unlock!(password:, base_version_id: @operation.base_version_id)
        @document.reload
      when "compress"
        processor.compress!(base_version_id: @operation.base_version_id)
        @document.reload
      when "extract_text"
        attach_operation_artifact(processor.extract_text!)
      when "export_images"
        attach_operation_artifact(processor.export_images!)
      when "redact"
        processor.redact!(
          regions: @parameters.fetch(:regions),
          base_version_id: @operation.base_version_id
        )
        @document.reload
      when "merge"
        merge_documents!
      when "extract_pages"
        extract_pages!
      when "split_by_size"
        split_by_size!
      else
        raise ArgumentError, "Unsupported PDF operation."
      end
    end

    def processor
      @processor ||= Processor.new(document: @document, user: @user)
    end

    def merge_documents!
      ids = Array(@parameters[:document_ids]).map(&:to_i).uniq
      raise ArgumentError, "Choose at least two documents." if ids.length < 2
      raise ArgumentError, "Merge is limited to 25 documents." if ids.length > PdfDocument::MAX_DOCUMENTS_PER_USER
      documents = @user.pdf_documents.where(id: ids).index_by(&:id)
      ordered = ids.map { |id| documents[id] }
      raise ActiveRecord::RecordNotFound, "One or more documents were not found." if ordered.any?(&:nil?)
      raise ArgumentError, "Unlock encrypted PDFs before merging." if ordered.any?(&:encrypted?)

      Tempfile.create(["pdf-merged-", ".pdf"], binmode: true) do |output|
        output.close
        paths = []
        ordered.each do |document|
          document.current_version.file.open do |file|
            copy = Tempfile.new(["pdf-merge-source-", ".pdf"], binmode: true)
            FileUtils.cp(file.path, copy.path)
            paths << copy
          end
        end
        PdfMaster::Modify.merge_pdfs(output.path, *paths.map(&:path))
        Manager.create_from_path!(
          user: @user,
          path: output.path,
          filename: "#{@parameters[:title].presence || "Merged document"}.pdf",
          title: @parameters[:title].presence || "Merged document",
          operation: "merge"
        )
      ensure
        Array(paths).each(&:close!)
      end
    end

    def extract_pages!
      pages = Array(@parameters[:page_numbers]).map(&:to_i).uniq.sort
      raise ArgumentError, "Choose at least one page." if pages.empty?
      unless pages.all? { |page| page.between?(1, @document.page_count.to_i) }
        raise ArgumentError, "One or more page numbers are invalid."
      end

      @document.current_version.file.open do |source|
        Tempfile.create(["pdf-extract-", ".pdf"], binmode: true) do |output|
          output.close
          PdfMaster::Modify.extract_pages(source.path, pages, output.path)
          Manager.create_from_path!(
            user: @user,
            path: output.path,
            filename: "#{File.basename(@document.original_filename, ".pdf")}-pages.pdf",
            title: "#{@document.title} pages",
            operation: "extract_pages"
          )
        end
      end
    end

    def split_by_size!
      max_bytes = @parameters.fetch(:max_size_mb, 10).to_f.megabytes.to_i
      raise ArgumentError, "Split size must be between 1MB and 50MB." unless max_bytes.between?(1.megabyte, 50.megabytes)

      @document.current_version.file.open do |source|
        parts = split_pdf(source.path, max_bytes)
        PdfDocument.transaction do
          @user.workspace&.lock!
          @user.lock!
          Manager.ensure_document_slot!(@user, additional: parts.length)
          Manager.ensure_storage!(@user, parts.sum { |file| File.size(file.path) })
          parts.map.with_index(1) do |file, index|
            Manager.create_from_path!(
              user: @user,
              path: file.path,
              filename: "#{File.basename(@document.original_filename, ".pdf")}-part-#{index}.pdf",
              title: "#{@document.title} part #{index}",
              operation: "split_by_size"
            )
          end
        end
      ensure
        Array(parts).each(&:close!)
      end
    end

    def split_pdf(path, max_bytes)
      source = CombinePDF.load(path)
      outputs = []
      current = CombinePDF.new

      source.pages.each do |page|
        candidate = CombinePDF.new
        current.pages.each { |existing| candidate << existing }
        candidate << page
        if current.pages.any? && pdf_size(candidate) > max_bytes
          outputs << save_part(current)
          current = CombinePDF.new
        end
        current << page
      end
      outputs << save_part(current) if current.pages.any?
      raise ArgumentError, "The document is already below the selected split size." if outputs.length < 2
      raise ArgumentError, "Split would create more than 25 files." if outputs.length > 25
      if outputs.any? { |file| File.size(file.path) > max_bytes }
        raise ArgumentError, "At least one page is larger than the selected split size."
      end

      outputs
    rescue StandardError
      outputs.each(&:close!)
      raise
    end

    def pdf_size(pdf)
      Tempfile.create(["pdf-size-", ".pdf"]) do |file|
        file.close
        pdf.save(file.path)
        File.size(file.path)
      end
    end

    def save_part(pdf)
      file = Tempfile.new(["pdf-part-", ".pdf"])
      file.close
      pdf.save(file.path)
      file
    end

    def attach_operation_artifact(artifact)
      artifact.update!(pdf_document_operation: @operation)
      artifact
    end

    def normalize_result(result)
      case result
      when PdfDocument
        { document_id: result.id }
      when PdfDocumentArtifact
        { artifact_id: result.id }
      when Array
        { document_ids: result.filter_map { |item| item.id if item.is_a?(PdfDocument) } }
      else
        {}
      end
    end
  end
end
