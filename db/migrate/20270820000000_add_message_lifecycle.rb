class AddMessageLifecycle < ActiveRecord::Migration[7.1]
  def change
    add_column :messages, :edited_at, :datetime
    add_column :messages, :deleted_at, :datetime
  end
end
