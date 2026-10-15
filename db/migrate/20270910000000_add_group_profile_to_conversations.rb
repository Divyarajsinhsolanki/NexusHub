class AddGroupProfileToConversations < ActiveRecord::Migration[7.1]
  def change
    add_column :conversations, :description, :text
    add_column :conversations, :members_can_edit_group_info, :boolean, default: false, null: false
  end
end
