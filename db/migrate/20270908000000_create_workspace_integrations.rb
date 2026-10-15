class CreateWorkspaceIntegrations < ActiveRecord::Migration[8.0]
  def change
    create_table :workspace_integrations do |t|
      t.references :workspace, null: false, foreign_key: true
      t.string :provider, null: false
      t.text :secret_ciphertext
      t.jsonb :public_settings, null: false, default: {}
      t.datetime :revoked_at
      t.timestamps
    end
    add_index :workspace_integrations, [:workspace_id, :provider], unique: true
    add_check_constraint :workspace_integrations, "provider IN ('google_sheets', 'slack')", name: "workspace_integrations_provider"
    add_column :users, :keka_secret_ciphertext, :text
  end
end
