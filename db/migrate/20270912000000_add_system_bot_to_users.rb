class AddSystemBotToUsers < ActiveRecord::Migration[7.1]
  def change
    add_column :users, :system_bot, :boolean, default: false, null: false
    add_index :users, :workspace_id, unique: true, where: "system_bot = true", name: "index_one_system_bot_per_workspace"
  end
end
