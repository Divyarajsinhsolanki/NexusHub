class Api::PdfDocumentsController < Api::BaseController
  before_action :set_document, only: %i[
    show update destroy content download undo redo restore_original
  ]

  def index
    documents = current_user.pdf_documents.includes(:current_version, thumbnail_attachment: :blob)
      .order(updated_at: :desc)
    if params[:q].present?
      pattern = "%#{ActiveRecord::Base.sanitize_sql_like(params[:q].to_s.strip)}%"
      documents = documents.where(
        "title ILIKE :pattern OR original_filename ILIKE :pattern OR searchable_text ILIKE :pattern",
        pattern:
      )
    end

    render json: {
      documents: documents.map { |document| serialize(document) },
      usage: PdfDocuments::Manager.user_usage(current_user)
    }
  end

  def show
    render json: serialize(@document)
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
    redirect_to rails_blob_path(@document.current_version.file, only_path: true), allow_other_host: false
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

  def serialize(document)
    PdfDocuments::Serializer.new(document, context: self).as_json
  end
end
