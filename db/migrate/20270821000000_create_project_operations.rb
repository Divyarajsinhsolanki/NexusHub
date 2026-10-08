class CreateProjectOperations < ActiveRecord::Migration[8.1]
  def change
    add_column :projects, :operations_revision, :bigint, null: false, default: 0

    create_table :project_operation_items do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :project, null: false, foreign_key: true
      t.string :kind, null: false
      t.string :name, null: false
      t.text :description
      t.string :category
      t.boolean :secret, null: false, default: true
      t.string :comparison, null: false, default: "environment_specific"
      t.jsonb :details, null: false, default: {}
      t.text :encrypted_license_key
      t.string :encrypted_license_key_iv
      t.timestamps
    end
    add_index :project_operation_items, [:project_id, :kind, :name], unique: true, name: "idx_operation_item_identity"

    create_table :project_operation_entries do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :project, null: false, foreign_key: true
      t.references :project_operation_item, null: false, foreign_key: true, index: { name: "idx_operation_entry_item" }
      t.references :project_environment, null: false, foreign_key: true, index: { name: "idx_operation_entry_environment" }
      t.references :updated_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.boolean :required, null: false, default: false
      t.text :encrypted_value
      t.string :encrypted_value_iv
      t.string :expected_version
      t.string :observed_version
      t.datetime :observed_at
      t.string :source, null: false, default: "manual"
      t.jsonb :details, null: false, default: {}
      t.timestamps
    end
    add_index :project_operation_entries, [:project_operation_item_id, :project_environment_id], unique: true, name: "idx_operation_entry_identity"

    create_table :project_operation_changes do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :project, null: false, foreign_key: true
      t.references :actor, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :action, null: false
      t.string :item_kind
      t.string :item_name
      t.string :environment_name
      t.jsonb :metadata, null: false, default: {}
      t.text :reason
      t.timestamps
    end
    add_index :project_operation_changes, [:project_id, :created_at], name: "idx_operation_change_history"
  end
end
