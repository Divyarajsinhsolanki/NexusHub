class AddPdfEditLayers < ActiveRecord::Migration[8.1]
  def change
    create_table :pdf_document_edit_layers do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :pdf_document, null: false, foreign_key: true
      t.jsonb :geometry, null: false, default: []
      t.timestamps
    end
    add_reference :pdf_document_versions, :edit_layer, foreign_key: { to_table: :pdf_document_edit_layers }
  end
end
