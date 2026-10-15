class CreateWorkspaceMemberships < ActiveRecord::Migration[8.1]
  def up
    add_index :users, [:id, :workspace_id], unique: true, name: "index_users_for_workspace_membership"
    create_table :workspace_memberships do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.string :status, null: false, default: "active"
      t.timestamps
    end
    add_index :workspace_memberships, [:user_id, :workspace_id], unique: true
    add_check_constraint :workspace_memberships, "status IN ('active', 'suspended')", name: "workspace_membership_status"
    add_foreign_key :workspace_memberships, :users, column: [:user_id, :workspace_id], primary_key: [:id, :workspace_id], on_delete: :cascade, name: "fk_membership_home_workspace"

    # Preserve each existing account's tenant and roles, including the legacy
    # workspace. Never infer company ownership or split previously merged data.
    execute <<~SQL
      INSERT INTO workspace_memberships (user_id, workspace_id, status, created_at, updated_at)
      SELECT id, workspace_id, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM users
    SQL
    add_foreign_key :user_roles, :workspace_memberships,
      column: [:user_id, :workspace_id], primary_key: [:user_id, :workspace_id],
      on_delete: :cascade, name: "fk_user_roles_workspace_membership"
  end

  def down
    remove_foreign_key :user_roles, name: "fk_user_roles_workspace_membership"
    drop_table :workspace_memberships
    remove_index :users, name: "index_users_for_workspace_membership"
  end
end
