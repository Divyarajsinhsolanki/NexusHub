class AddOperationObservationVerification < ActiveRecord::Migration[8.1]
  def change
    add_reference :project_operation_entries, :verified_by, foreign_key: { to_table: :users, on_delete: :nullify }
    add_column :project_operation_entries, :verified_at, :datetime
  end
end
