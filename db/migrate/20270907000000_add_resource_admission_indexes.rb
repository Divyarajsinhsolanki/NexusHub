class AddResourceAdmissionIndexes < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def up
    execute <<~SQL
      CREATE INDEX CONCURRENTLY IF NOT EXISTS index_blobs_on_upload_workspace_and_created_at
      ON active_storage_blobs ((NULLIF(metadata, '')::jsonb ->> 'workspace_id'), created_at)
      WHERE NULLIF(metadata, '')::jsonb ->> 'mobile_upload' = 'true'
    SQL
    add_index :pdf_document_operations, [:workspace_id, :status, :user_id],
      name: "index_pdf_operations_on_workspace_status_user", algorithm: :concurrently, if_not_exists: true
  end

  def down
    remove_index :pdf_document_operations, name: "index_pdf_operations_on_workspace_status_user", algorithm: :concurrently, if_exists: true
    remove_index :active_storage_blobs, name: "index_blobs_on_upload_workspace_and_created_at", algorithm: :concurrently, if_exists: true
  end
end
