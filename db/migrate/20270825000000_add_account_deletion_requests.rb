class AddAccountDeletionRequests < ActiveRecord::Migration[8.0]
  def change
    add_column :users, :deleted_at, :datetime
    create_table :account_deletion_requests do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.string :status, null: false, default: 'verification_pending'
      t.string :verification_digest
      t.datetime :verification_expires_at
      t.integer :verification_attempts, null: false, default: 0
      t.datetime :code_sent_at
      t.datetime :delete_after
      t.datetime :completed_at
      t.string :receipt_id, null: false
      t.text :failure_reason
      t.timestamps
    end
    add_index :account_deletion_requests, [:status, :delete_after]
  end
end
