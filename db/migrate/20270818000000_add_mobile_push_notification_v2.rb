class AddMobilePushNotificationV2 < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :push_notification_settings, :jsonb, null: false, default: {}

    add_column :notifications, :feed_visible, :boolean, null: false, default: true
    add_column :notifications, :group_key, :string
    add_index :notifications, [:recipient_id, :group_key, :created_at], name: "idx_notifications_recipient_group_created"

    add_column :mobile_devices, :push_schema_version, :integer, null: false, default: 1
    add_column :mobile_devices, :app_variant, :string, null: false, default: "legacy"
    add_column :mobile_devices, :native_build_version, :string

    add_column :messages, :client_id, :string
    add_index :messages,
      [:conversation_id, :user_id, :client_id],
      unique: true,
      where: "client_id IS NOT NULL",
      name: "idx_messages_conversation_user_client"

    create_table :push_deliveries do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :recipient, null: false, foreign_key: { to_table: :users }
      t.references :mobile_device, null: false, foreign_key: true
      t.references :notification, null: true, foreign_key: { on_delete: :nullify }
      t.string :source_type
      t.bigint :source_id
      t.string :event_type, null: false
      t.string :deduplication_key, null: false
      t.string :status, null: false, default: "queued"
      t.string :expo_ticket_id
      t.integer :attempt_count, null: false, default: 0
      t.string :last_error_code
      t.string :last_error_message
      t.datetime :sent_at
      t.datetime :receipt_checked_at
      t.timestamps
    end

    add_index :push_deliveries, :deduplication_key, unique: true
    add_index :push_deliveries, [:status, :created_at]
    add_index :push_deliveries, [:source_type, :source_id]
    add_index :push_deliveries, :expo_ticket_id, unique: true, where: "expo_ticket_id IS NOT NULL"
  end
end
