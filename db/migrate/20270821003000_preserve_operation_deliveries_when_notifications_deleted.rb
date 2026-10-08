class PreserveOperationDeliveriesWhenNotificationsDeleted < ActiveRecord::Migration[8.1]
  def up
    remove_foreign_key :operation_reminder_deliveries, :notifications
    add_foreign_key :operation_reminder_deliveries, :notifications, on_delete: :nullify
  end

  def down
    remove_foreign_key :operation_reminder_deliveries, :notifications
    add_foreign_key :operation_reminder_deliveries, :notifications
  end
end
