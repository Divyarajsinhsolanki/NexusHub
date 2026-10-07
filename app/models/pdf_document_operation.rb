class PdfDocumentOperation < ApplicationRecord
  include WorkspaceScoped

  STATUSES = %w[queued processing completed failed].freeze

  belongs_to :user, inverse_of: :pdf_document_operations
  belongs_to :pdf_document, optional: true, inverse_of: :operations
  belongs_to :base_version, class_name: "PdfDocumentVersion", optional: true
  has_many_attached :source_files
  has_many :artifacts,
           class_name: "PdfDocumentArtifact",
           dependent: :destroy,
           inverse_of: :pdf_document_operation

  validates :kind, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :progress, numericality: { only_integer: true, in: 0..100 }
end
