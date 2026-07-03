class PdfDocument < ApplicationRecord
  include WorkspaceScoped

  DEFAULT_DOCUMENT_LIMIT = 25
  DEFAULT_STORAGE_LIMIT = 1.gigabyte
  MAX_DOCUMENTS_PER_USER = DEFAULT_DOCUMENT_LIMIT
  MAX_STORAGE_PER_USER = DEFAULT_STORAGE_LIMIT
  MAX_UPLOAD_SIZE = 50.megabytes
  MAX_EDIT_VERSIONS = 20

  belongs_to :user, inverse_of: :pdf_documents
  belongs_to :current_version, class_name: "PdfDocumentVersion", optional: true

  has_many :versions,
           -> { order(:version_number) },
           class_name: "PdfDocumentVersion",
           dependent: :destroy,
           inverse_of: :pdf_document
  has_many :operations,
           class_name: "PdfDocumentOperation",
           dependent: :destroy,
           inverse_of: :pdf_document
  has_many :artifacts,
           class_name: "PdfDocumentArtifact",
           dependent: :destroy,
           inverse_of: :pdf_document
  has_one_attached :thumbnail

  validates :title, :original_filename, presence: true
  validates :title, length: { maximum: 160 }
  validates :original_filename, length: { maximum: 255 }

  before_destroy { update_column(:current_version_id, nil) if current_version_id.present? }

  def original_version
    versions.find_by(version_number: 1)
  end

  def undo_version
    return unless current_version

    versions.where("version_number < ?", current_version.version_number).reorder(version_number: :desc).first
  end

  def redo_version
    return unless current_version

    versions.where("version_number > ?", current_version.version_number).reorder(:version_number).first
  end

  def storage_bytes
    versions.sum(:byte_size)
  end

  def self.document_limit_for(user)
    user&.workspace&.saas_plan&.dig(:limits, :pdf_documents) || DEFAULT_DOCUMENT_LIMIT
  end

  def self.storage_limit_for(user)
    user&.workspace&.saas_plan&.dig(:limits, :storage_bytes) || DEFAULT_STORAGE_LIMIT
  end

  def self.storage_bytes_for(user)
    PdfDocumentVersion
      .unscoped
      .joins(:pdf_document)
      .where(pdf_documents: { user_id: user.id })
      .sum(:byte_size)
  end

  def self.document_count_for_workspace(workspace)
    return 0 unless workspace

    PdfDocument.unscoped.where(workspace_id: workspace.id).count
  end

  def self.storage_bytes_for_workspace(workspace)
    return 0 unless workspace

    PdfDocumentVersion.unscoped.where(workspace_id: workspace.id).sum(:byte_size)
  end
end
