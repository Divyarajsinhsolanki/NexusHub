class PreserveChatReferencesOnUserDeletion < ActiveRecord::Migration[8.0]
  def change
    remove_foreign_key :messages, :users, column: :pinned_by_id
    add_foreign_key :messages, :users, column: :pinned_by_id, on_delete: :nullify
    remove_foreign_key :scheduled_chat_messages, :messages, column: :reply_to_id
    add_foreign_key :scheduled_chat_messages, :messages, column: :reply_to_id, on_delete: :nullify
    remove_foreign_key :scheduled_chat_messages, :messages, column: :sent_message_id
    add_foreign_key :scheduled_chat_messages, :messages, column: :sent_message_id, on_delete: :nullify
  end
end
