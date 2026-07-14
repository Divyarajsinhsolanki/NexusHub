class AddCallsAndChatMuteOptimizations < ActiveRecord::Migration[7.1]
  def change
    add_reference :conversations, :last_message, foreign_key: { to_table: :messages }, null: true
    add_column :conversations, :last_message_at, :datetime
    add_index :conversations, [:workspace_id, :updated_at]
    add_index :conversations, [:workspace_id, :last_message_at]

    add_column :conversation_participants, :muted_at, :datetime
    add_column :conversation_participants, :muted_until, :datetime
    add_index :conversation_participants, [:conversation_id, :muted_until]
    add_index :conversation_participants, [:workspace_id, :user_id, :hidden_at], name: "idx_conversation_participants_visible_inbox"

    add_index :messages, [:workspace_id, :conversation_id, :id], name: "idx_messages_workspace_conversation_cursor"
    add_index :notifications, [:recipient_id, :action, :created_at]

    reversible do |dir|
      dir.up do
        execute <<~SQL.squish
          UPDATE conversations
          SET last_message_id = latest_messages.id,
              last_message_at = latest_messages.created_at
          FROM (
            SELECT DISTINCT ON (conversation_id)
              id,
              conversation_id,
              created_at
            FROM messages
            ORDER BY conversation_id, created_at DESC, id DESC
          ) latest_messages
          WHERE conversations.id = latest_messages.conversation_id
        SQL
      end
    end

    create_table :call_sessions do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :conversation, null: false, foreign_key: true
      t.references :initiator, null: false, foreign_key: { to_table: :users }
      t.string :call_type, null: false
      t.string :status, null: false, default: "ringing"
      t.string :livekit_room_name, null: false
      t.datetime :started_at
      t.datetime :ended_at
      t.string :ended_reason
      t.jsonb :metadata, null: false, default: {}
      t.timestamps
    end

    add_index :call_sessions, :livekit_room_name, unique: true
    add_index :call_sessions, [:workspace_id, :conversation_id, :created_at], name: "idx_call_sessions_conversation_history"
    add_index :call_sessions, [:status, :created_at], name: "idx_call_sessions_status_created"
    add_index :call_sessions, [:conversation_id],
      unique: true,
      where: "status IN ('ringing', 'active')",
      name: "idx_one_live_call_per_conversation"

    create_table :call_participants do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :call_session, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :status, null: false, default: "ringing"
      t.datetime :ring_acknowledged_at
      t.datetime :joined_at
      t.datetime :left_at
      t.timestamps
    end

    add_index :call_participants, [:call_session_id, :user_id], unique: true, name: "idx_unique_call_participant"
    add_index :call_participants, [:workspace_id, :user_id, :status], name: "idx_call_participants_user_status"
  end
end
