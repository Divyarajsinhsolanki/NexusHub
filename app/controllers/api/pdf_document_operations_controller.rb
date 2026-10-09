class Api::PdfDocumentOperationsController < Api::BaseController
  before_action :set_operation, only: :show

  def index
    operations = current_user.pdf_document_operations.order(created_at: :desc).limit(20)
    operations = operations.where(pdf_document_id: current_user.pdf_documents.find(params[:pdf_document_id]).id) if params[:pdf_document_id].present?
    render json: { operations: operations.map { |operation| PdfDocuments::OperationSerializer.new(operation, context: self, include_document: false).as_json } }
  end

  def show
    PdfDocuments::OperationRunner.recover_expired!(@operation)
    render json: serialize_operation(@operation)
  end

  def create
    kind = params.require(:kind).to_s
    raise ArgumentError, "Unsupported PDF operation." unless PdfDocuments::OperationRunner::ALLOWED_KINDS.include?(kind)

    document = document_for_operation(kind)
    base_version_id = Integer(params[:base_version_id]) if params[:base_version_id].present?
    parameters = operation_parameters
    raise ArgumentError, "Operation parameters are too large." if parameters.to_json.bytesize > 1.megabyte

    asynchronous = PdfDocuments::OperationRunner::ASYNC_KINDS.include?(kind)
    operation = PdfDocumentOperation.transaction do
      document&.lock!
      validate_base_version!(document, base_version_id) if document
      parameters["source_versions"] = capture_merge_sources!(parameters) if kind == "merge"
      accepted = current_user.pdf_document_operations.create!(
        workspace: current_user.workspace,
        pdf_document: document,
        base_version_id:,
        kind:,
        parameters: parameters.except("password")
      )
      if asynchronous
        versions = if kind == "merge"
          parameters.fetch("source_versions").map { |source| current_user.pdf_documents.find(source.fetch("document_id")).versions.find(source.fetch("version_id")) }
        else
          [document.versions.find(base_version_id)]
        end
        PdfDocuments::Sources.capture!(accepted, versions)
      end
      accepted
    end

    if asynchronous
      PdfDocumentOperationJob.perform_later(operation.id)
      render json: serialize_operation(operation), status: :accepted
    else
      PdfDocuments::OperationRunner.new(operation).run!(
        password: params[:password],
        asset: params[:asset],
        assets: params[:assets].is_a?(ActionController::Parameters) ? params[:assets].to_unsafe_h : (params[:assets] || {})
      )
      render json: serialize_operation(operation.reload), status: :created
    end
  rescue PdfDocuments::Manager::StaleVersion => e
    render json: { error: e.message }, status: :conflict
  rescue ActiveRecord::RecordNotFound
    render json: { error: "PDF document was not found." }, status: :not_found
  rescue ArgumentError, KeyError, PdfDocuments::Manager::QuotaExceeded => e
    render json: { error: e.message }, status: :unprocessable_content
  rescue TypeError
    render json: { error: "Operation parameters are invalid." }, status: :unprocessable_content
  end

  private

  def set_operation
    @operation = current_user.pdf_document_operations.find(params[:id])
  end

  def document_for_operation(kind)
    return if kind == "merge"

    current_user.pdf_documents.find(params.require(:pdf_document_id))
  end

  def validate_base_version!(document, base_version_id)
    raise ArgumentError, "base_version_id is required." if base_version_id.blank?
    return if document.current_version_id == base_version_id.to_i

    raise PdfDocuments::Manager::StaleVersion,
          "Document changed in another request. Reload and try again."
  end

  def operation_parameters
    raw = params[:parameters]
    return {} if raw.blank?

    value = raw.is_a?(String) ? JSON.parse(raw) : raw.is_a?(ActionController::Parameters) ? raw.to_unsafe_h : raw
    raise ArgumentError, "Operation parameters must be an object." unless value.is_a?(Hash)
    value.deep_stringify_keys.except("_source_snapshots", PdfDocumentOperation::PROCESSING_LEASE_KEY)
  rescue JSON::ParserError
    raise ArgumentError, "Operation parameters are invalid."
  end

  def capture_merge_sources!(parameters)
    ids = Array(parameters["document_ids"]).map { |id| Integer(id) }.uniq
    raise ArgumentError, "Choose at least two documents." if ids.length < 2
    raise ArgumentError, "Merge is limited to 25 documents." if ids.length > 25
    documents = current_user.pdf_documents.where(id: ids).order(:id).lock.index_by(&:id)
    ids.map do |id|
      document = documents.fetch(id) { raise ActiveRecord::RecordNotFound }
      raise ArgumentError, "Unlock encrypted PDFs before merging." if document.encrypted?
      { "document_id" => id, "version_id" => document.current_version_id }
    end
  end

  def serialize_operation(operation)
    PdfDocuments::OperationSerializer.new(operation, context: self).as_json
  end
end
