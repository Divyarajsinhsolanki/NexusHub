class AddChatProductivityFeatures < ActiveRecord::Migration[8.0]
  def change
    add_column :messages, :pinned_at, :datetime
    add_reference :messages, :pinned_by, foreign_key: { to_table: :users }, null: true
    add_index :messages, [:conversation_id, :pinned_at]
    add_index :messages, [:conversation_id, :reply_to_id]
    create_table :scheduled_chat_messages do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :conversation, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.text :body
      t.references :reply_to, foreign_key: { to_table: :messages }, null: true
      t.string :client_id, null: false
      t.datetime :send_at, null: false
      t.string :state, null: false, default: 'pending'
      t.references :sent_message, foreign_key: { to_table: :messages }, null: true
      t.timestamps
    end
    add_index :scheduled_chat_messages, [:conversation_id, :user_id, :client_id], unique: true, name: 'index_scheduled_chat_messages_identity'
    add_index :scheduled_chat_messages, [:state, :send_at]
  end
end
