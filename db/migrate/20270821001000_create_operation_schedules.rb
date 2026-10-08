class CreateOperationSchedules < ActiveRecord::Migration[8.1]
  def change
    create_table :project_deployment_series do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :project, null: false, foreign_key: true
      t.references :project_environment, null: false, foreign_key: true
      t.references :owner, null: false, foreign_key: { to_table: :users }
      t.string :name, null: false
      t.string :time_zone, null: false
      t.string :frequency, null: false
      t.string :local_time, null: false
      t.date :starts_on, null: false
      t.date :ends_on
      t.integer :day_of_month
      t.jsonb :weekdays, null: false, default: []
      t.jsonb :recipient_ids, null: false, default: []
      t.jsonb :reminder_minutes, null: false, default: [1440, 60]
      t.jsonb :targets, null: false, default: []
      t.text :notes
      t.boolean :active, null: false, default: true
      t.timestamps
    end

    create_table :project_deployments do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :project, null: false, foreign_key: true
      t.references :project_environment, null: false, foreign_key: true
      t.references :project_deployment_series, foreign_key: true, index: { name: 'idx_deployments_series' }
      t.references :owner, null: false, foreign_key: { to_table: :users }
      t.references :verified_by, foreign_key: { to_table: :users }
      t.string :name, null: false
      t.string :time_zone, null: false
      t.string :status, null: false, default: 'planned'
      t.string :occurrence_key
      t.datetime :scheduled_at, null: false
      t.datetime :started_at
      t.datetime :deployed_at
      t.datetime :verified_at
      t.integer :schedule_revision, null: false, default: 0
      t.jsonb :recipient_ids, null: false, default: []
      t.jsonb :reminder_minutes, null: false, default: [1440, 60]
      t.jsonb :targets, null: false, default: []
      t.jsonb :observations, null: false, default: []
      t.text :notes
      t.timestamps
    end
    add_index :project_deployments, [:project_deployment_series_id, :occurrence_key], unique: true, name: 'idx_unique_deployment_occurrence'
    add_index :project_deployments, [:project_id, :scheduled_at]

    create_table :operation_reminder_deliveries do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :project, null: false, foreign_key: true
      t.references :recipient, null: false, foreign_key: { to_table: :users }
      t.references :source, polymorphic: true, null: false, index: true
      t.references :notification, foreign_key: true
      t.string :schedule_revision, null: false
      t.string :channel, null: false
      t.string :state, null: false, default: 'pending'
      t.string :failure_class
      t.datetime :send_at, null: false
      t.datetime :sent_at
      t.datetime :claimed_at
      t.integer :attempts, null: false, default: 0
      t.timestamps
    end
    add_index :operation_reminder_deliveries, [:source_type, :source_id, :schedule_revision, :recipient_id, :channel, :send_at], unique: true, name: 'idx_unique_operation_reminder'
    add_index :operation_reminder_deliveries, [:state, :send_at], name: 'idx_due_operation_reminders'
    add_reference :calendar_events, :operation_source, polymorphic: true, index: { unique: true, name: 'idx_calendar_operation_source' }
  end
end
