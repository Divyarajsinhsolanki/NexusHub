class PreserveSupportGrantHistory < ActiveRecord::Migration[8.1]
  def change
    [:approved_by, :support_user].each do |association|
      remove_foreign_key :support_access_grants, column: "#{association}_id"
      change_column_null :support_access_grants, "#{association}_id", true
      add_foreign_key :support_access_grants, :users, column: "#{association}_id", on_delete: :nullify
    end
    add_foreign_key :support_access_grants, :users, column: [:approved_by_id, :workspace_id], primary_key: [:id, :workspace_id], name: "fk_support_approver_workspace"
  end
end
