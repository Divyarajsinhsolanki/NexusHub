class AddSearchableTextToPdfDocuments < ActiveRecord::Migration[8.0]
  def change
    add_column :pdf_documents, :searchable_text, :text
    add_column :pdf_documents, :text_indexed_at, :datetime
    add_column :pdf_documents, :text_index_error, :text
  end
end
