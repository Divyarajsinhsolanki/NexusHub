class AddWorkspaceInvitationsAndOffboarding < ActiveRecord::Migration[8.1]
  def change
    add_column :workspace_memberships, :offboarded_at, :datetime
    add_reference :workspace_memberships, :offboarded_by, foreign_key: { to_table: :users, on_delete: :nullify }
    create_table :workspace_invitations do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :invited_by, null: false, foreign_key: { to_table: :users }
      t.references :accepted_user, foreign_key: { to_table: :users, on_delete: :nullify }
      t.references :department, foreign_key: { on_delete: :nullify }
      t.string :email, null: false
      t.string :token_digest, null: false
      t.string :status, null: false, default: "pending"
      t.jsonb :role_names, null: false, default: ["member"]
      t.jsonb :project_ids, null: false, default: []
      t.datetime :expires_at, null: false
      t.datetime :accepted_at
      t.datetime :revoked_at
      t.datetime :last_sent_at
      t.string :delivery_status, null: false, default: "queued"
      t.timestamps
    end
    add_index :workspace_invitations, :token_digest, unique: true
    add_index :workspace_invitations, [:workspace_id, :email], unique: true, where: "status = 'pending'", name: "index_pending_workspace_invitation_email"
    add_check_constraint :workspace_invitations, "status IN ('pending', 'accepted', 'revoked', 'expired')", name: "workspace_invitation_status"
    create_table :workspace_access_events do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :actor, foreign_key: { to_table: :users, on_delete: :nullify }
      t.references :subject, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :action, null: false
      t.jsonb :details, null: false, default: {}
      t.timestamps
    end
    add_index :workspace_access_events, [:workspace_id, :created_at]
  end
end
