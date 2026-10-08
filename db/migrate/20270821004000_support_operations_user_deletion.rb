class SupportOperationsUserDeletion < ActiveRecord::Migration[8.1]
  def up
    remove_foreign_key :project_deployments, column: :verified_by_id
    add_foreign_key :project_deployments, :users, column: :verified_by_id, on_delete: :nullify
    remove_foreign_key :operation_reminder_deliveries, column: :recipient_id
    add_foreign_key :operation_reminder_deliveries, :users, column: :recipient_id, on_delete: :cascade
  end

  def down
    remove_foreign_key :project_deployments, column: :verified_by_id
    add_foreign_key :project_deployments, :users, column: :verified_by_id
    remove_foreign_key :operation_reminder_deliveries, column: :recipient_id
    add_foreign_key :operation_reminder_deliveries, :users, column: :recipient_id
  end
end
