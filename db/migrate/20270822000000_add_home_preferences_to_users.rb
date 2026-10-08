class AddHomePreferencesToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :home_preferences, :jsonb, default: {}, null: false
  end
end
