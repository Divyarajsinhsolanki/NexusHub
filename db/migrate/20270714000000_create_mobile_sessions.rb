class CreateMobileSessions < ActiveRecord::Migration[8.0]
  def change
    create_table :mobile_sessions do |t|
      t.references :user, null: false, foreign_key: true
      t.references :workspace, null: false, foreign_key: true
      t.string :refresh_token_digest, null: false
      t.string :device_name
      t.datetime :expires_at, null: false
      t.datetime :last_used_at
      t.datetime :revoked_at

      t.timestamps
    end

    add_index :mobile_sessions, :refresh_token_digest, unique: true
    add_index :mobile_sessions, [:user_id, :revoked_at]
    add_index :mobile_sessions, :expires_at
  end
end
