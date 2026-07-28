class AddFullMobileSupport < ActiveRecord::Migration[8.1]
  def change
    add_reference :mobile_sessions, :impersonated_user, foreign_key: { to_table: :users }

    create_table :mobile_devices do |t|
      t.references :user, null: false, foreign_key: true
      t.references :workspace, null: false, foreign_key: true
      t.string :expo_push_token, null: false
      t.string :platform, null: false
      t.string :device_identifier
      t.string :device_name
      t.string :app_version
      t.boolean :active, null: false, default: true
      t.datetime :last_seen_at
      t.datetime :disabled_at
      t.timestamps
    end

    add_index :mobile_devices, :expo_push_token, unique: true
    add_index :mobile_devices, [:user_id, :active]
    add_index :mobile_devices, [:workspace_id, :active]
  end
end
