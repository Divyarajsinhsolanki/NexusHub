module PdfDocuments
  class OperationSerializer
    def initialize(operation, context:, include_document: true)
      @operation, @context, @include_document = operation, context, include_document
    end

    def as_json(*)
      artifacts = @operation.artifacts.includes(file_attachment: :blob).map do |artifact|
        { id: artifact.id, kind: artifact.kind, filename: artifact.file.filename.to_s,
          byte_size: artifact.file.byte_size, expires_at: artifact.expires_at,
          url: @context.rails_blob_path(artifact.file, only_path: true),
          download_url: @context.rails_blob_path(artifact.file, disposition: "attachment", only_path: true) }
      end
      { id: @operation.id, kind: @operation.kind, status: @operation.status, progress: @operation.progress,
        error: @operation.error_message, result: @operation.result, artifacts:,
        pdf_document_id: @operation.pdf_document_id, base_version_id: @operation.base_version_id,
        document: @include_document && @operation.pdf_document ? Serializer.new(@operation.pdf_document.reload, context: @context).as_json : nil,
        created_at: @operation.created_at, completed_at: @operation.completed_at }
    end
  end
end
