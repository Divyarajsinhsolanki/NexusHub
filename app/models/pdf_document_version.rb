class PdfDocumentVersion < ApplicationRecord
  include WorkspaceScoped

  belongs_to :pdf_document, inverse_of: :versions
  belongs_to :created_by, class_name: "User"
  belongs_to :parent_version, class_name: "PdfDocumentVersion", optional: true
  belongs_to :edit_layer, class_name: "PdfDocumentEditLayer", optional: true
  has_one_attached :file

  validates :version_number, numericality: { only_integer: true, greater_than: 0 }
  validates :operation, presence: true
  validates :byte_size, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :version_number, uniqueness: { scope: :pdf_document_id }
  validate :file_is_pdf
  validate :edit_layer_belongs_to_document

  private

  def edit_layer_belongs_to_document
    return unless edit_layer
    errors.add(:edit_layer, "must belong to this document") unless edit_layer.pdf_document_id == pdf_document_id
  end

  def file_is_pdf
    return unless file.attached?

    errors.add(:file, "must be a PDF") unless file.blob.content_type == "application/pdf"
    errors.add(:file, "must be 50MB or smaller") if file.blob.byte_size > PdfDocument::MAX_UPLOAD_SIZE
  end
end
