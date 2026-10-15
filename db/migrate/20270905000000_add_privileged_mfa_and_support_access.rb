class AddPrivilegedMfaAndSupportAccess < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :mfa_secret_ciphertext, :text
    add_column :users, :mfa_pending_secret_ciphertext, :text
    add_column :users, :mfa_pending_expires_at, :datetime
    add_column :users, :mfa_enabled_at, :datetime
    add_column :users, :mfa_last_otp_at, :bigint
    add_column :users, :mfa_recovery_digests, :jsonb, default: [], null: false
    add_column :users, :mfa_failed_attempts, :integer, default: 0, null: false
    add_column :users, :mfa_locked_until, :datetime
    [:web_sessions, :mobile_sessions].each do |table|
      add_column table, :primary_verified_at, :datetime
      add_column table, :mfa_verified_at, :datetime
    end
    reversible do |direction|
      direction.up { execute "UPDATE mobile_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE impersonated_user_id IS NOT NULL AND revoked_at IS NULL" }
    end
    create_table :support_access_grants do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :approved_by, null: false, foreign_key: { to_table: :users }
      t.references :support_user, null: false, foreign_key: { to_table: :users }
      t.text :reason, null: false
      t.jsonb :resources, null: false, default: []
      t.datetime :expires_at, null: false
      t.datetime :revoked_at
      t.timestamps
    end
    add_index :support_access_grants, [:support_user_id, :expires_at]
  end
end
