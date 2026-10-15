class CreatePrivacyRequests < ActiveRecord::Migration[7.1]
  def change
    create_table :privacy_requests do |t|
      t.string :reference, null: false
      t.string :request_type, null: false
      t.string :status, null: false, default: 'pending_verification'
      t.text :payload_ciphertext
      t.datetime :email_verified_at
      t.datetime :identity_verified_at
      t.datetime :target_response_at, null: false
      t.datetime :closed_at
      t.datetime :redacted_at
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :privacy_requests, :reference, unique: true
    add_index :privacy_requests, [:status, :target_response_at]
    create_table :privacy_request_events do |t|
      t.references :privacy_request, null: false, foreign_key: true
      t.references :actor, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :action, null: false
      t.string :status, null: false
      t.timestamps
    end
  end
end
