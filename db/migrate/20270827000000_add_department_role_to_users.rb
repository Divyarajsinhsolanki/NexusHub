class AddDepartmentRoleToUsers < ActiveRecord::Migration[7.1]
  def change
    add_column :users, :department_role, :string, null: false, default: 'member'
    add_check_constraint :users, "department_role IN ('member', 'manager')", name: 'users_department_role_valid'
  end
end
