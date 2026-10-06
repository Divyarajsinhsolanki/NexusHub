class AddChatMessageContext < ActiveRecord::Migration[7.1]
  def change
    add_column :messages, :message_type, :string, default: 'message', null: false
    add_reference :messages, :reply_to, foreign_key: { to_table: :messages, on_delete: :nullify }
  end
end
