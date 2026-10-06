class CreateWebSessions < ActiveRecord::Migration[8.0]
  def change
    create_table :web_sessions do |t|
      t.references :user, null: false, foreign_key: true
      t.string :password_fingerprint, null: false
      t.datetime :expires_at, null: false
      t.datetime :revoked_at
      t.timestamps
    end
    add_index :web_sessions, :expires_at
  end
end
