class Api::PdfDocumentsController < Api::BaseController
  before_action :set_document, only: %i[
    show update destroy content download undo redo restore_original editor_background editor_asset operations
  ]

  def index
    documents = current_user.pdf_documents.includes(thumbnail_attachment: :blob)
      .order(updated_at: :desc)
    if params[:q].present?
      pattern = "%#{ActiveRecord::Base.sanitize_sql_like(params[:q].to_s.strip)}%"
      documents = documents.where(
        "title ILIKE :pattern OR original_filename ILIKE :pattern OR searchable_text ILIKE :pattern",
        pattern:
      )
    end

    # Library cards only need version identifiers and sizes. Loading full edit
    # snapshots for every history node would make this endpoint unnecessarily large.
    documents = documents.to_a
    summaries = PdfDocumentVersion.where(pdf_document_id: documents.map(&:id))
      .select(:id, :pdf_document_id, :version_number, :byte_size)
      .order(:version_number).group_by(&:pdf_document_id)
    documents.each do |document|
      versions = summaries.fetch(document.id, [])
      document.association(:versions).target = versions
      document.association(:current_version).target = versions.find { |version| version.id == document.current_version_id }
    end
    render json: {
      documents: documents.map { |document| serialize(document, include_editor: false) },
      usage: PdfDocuments::Manager.user_usage(current_user)
    }
  end

  def show
    render json: serialize(@document)
  end

  def editor_background
    layer = editor_layer!
    redirect_to rails_storage_proxy_path(layer.background, only_path: true), allow_other_host: false
  end

  def editor_asset
    layer = editor_layer!
    attachment = layer.asset_map[params.require(:asset_id).to_s]
    raise ActiveRecord::RecordNotFound unless attachment
    redirect_to rails_storage_proxy_path(attachment, only_path: true), allow_other_host: false
  end

  def operations
    render json: { operations: @document.operations.order(created_at: :desc).limit(20).map { |operation|
      PdfDocuments::OperationSerializer.new(operation, context: self, include_document: false).as_json
    } }
  end

  def create
    document = PdfDocuments::Manager.create_from_upload!(
      user: current_user,
      upload: params[:file] || params[:pdf],
      title: params[:title]
    )
    render json: serialize(document), status: :created
  rescue PdfDocuments::Manager::QuotaExceeded, ArgumentError => e
    render json: { error: e.message }, status: :unprocessable_content
  end

  def update
    if @document.update(title: params.require(:title).to_s.strip)
      render json: serialize(@document)
    else
      render json: { errors: @document.errors.full_messages }, status: :unprocessable_content
    end
  end

  def destroy
    @document.destroy!
    head :no_content
  end

  def content
    redirect_to rails_storage_proxy_path(@document.current_version.file, only_path: true), allow_other_host: false
  end

  def download
    redirect_to rails_blob_path(
      @document.current_version.file,
      disposition: "attachment",
      filename: "#{@document.title}.pdf",
      only_path: true
    ), allow_other_host: false
  end

  def undo
    target = @document.undo_version
    return render json: { error: "No operations to undo." }, status: :unprocessable_content unless target

    PdfDocuments::Manager.move_history!(document: @document, target_version: target)
    render json: serialize(@document.reload)
  end

  def redo
    target = @document.redo_version
    return render json: { error: "No operations to redo." }, status: :unprocessable_content unless target

    PdfDocuments::Manager.move_history!(document: @document, target_version: target)
    render json: serialize(@document.reload)
  end

  def restore_original
    PdfDocuments::Manager.move_history!(
      document: @document,
      target_version: @document.original_version
    )
    render json: serialize(@document.reload)
  end

  private

  def set_document
    @document = current_user.pdf_documents.find(params[:id])
  end

  def editor_layer!
    raise ActiveRecord::RecordNotFound if @document.encrypted?
    @document.edit_layers.find(params.require(:layer_id))
  end

  def serialize(document, include_editor: true)
    PdfDocuments::Serializer.new(document, context: self, include_editor:).as_json
  end
end
