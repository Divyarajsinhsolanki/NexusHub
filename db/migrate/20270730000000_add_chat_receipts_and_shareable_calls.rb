require "securerandom"

class AddChatReceiptsAndShareableCalls < ActiveRecord::Migration[7.1]
  def up
    add_column :conversation_participants, :last_delivered_message_id, :bigint
    add_column :conversation_participants, :last_read_message_id, :bigint
    add_column :conversation_participants, :last_delivered_at, :datetime
    add_index :conversation_participants,
      [:conversation_id, :last_delivered_message_id],
      name: "idx_conversation_participants_delivery_cursor"
    add_index :conversation_participants,
      [:conversation_id, :last_read_message_id],
      name: "idx_conversation_participants_read_cursor"

    execute <<~SQL.squish
      UPDATE conversation_participants AS memberships
      SET last_read_message_id = (
            SELECT MAX(messages.id)
            FROM messages
            WHERE messages.conversation_id = memberships.conversation_id
              AND messages.created_at <= memberships.last_read_at
          ),
          last_delivered_message_id = (
            SELECT MAX(messages.id)
            FROM messages
            WHERE messages.conversation_id = memberships.conversation_id
              AND messages.created_at <= memberships.last_read_at
          ),
          last_delivered_at = memberships.last_read_at
      WHERE memberships.last_read_at IS NOT NULL
    SQL

    add_column :call_sessions, :public_id, :string
    select_values("SELECT id FROM call_sessions WHERE public_id IS NULL").each do |call_session_id|
      execute <<~SQL.squish
        UPDATE call_sessions
        SET public_id = #{connection.quote(SecureRandom.uuid)}
        WHERE id = #{connection.quote(call_session_id)}
      SQL
    end
    change_column_null :call_sessions, :public_id, false
    add_index :call_sessions, :public_id, unique: true
  end

  def down
    remove_index :call_sessions, :public_id
    remove_column :call_sessions, :public_id

    remove_index :conversation_participants, name: "idx_conversation_participants_read_cursor"
    remove_index :conversation_participants, name: "idx_conversation_participants_delivery_cursor"
    remove_column :conversation_participants, :last_delivered_at
    remove_column :conversation_participants, :last_read_message_id
    remove_column :conversation_participants, :last_delivered_message_id
  end
end
