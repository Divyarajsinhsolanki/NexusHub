class PdfDocumentEditLayer < ApplicationRecord
  include WorkspaceScoped

  belongs_to :pdf_document
  has_many :versions, class_name: "PdfDocumentVersion", foreign_key: :edit_layer_id
  has_one_attached :background
  has_many_attached :assets

  def asset_map
    assets.includes(:blob).index_by { |attachment| attachment.blob.metadata["pdf_asset_id"] }
  end
end
