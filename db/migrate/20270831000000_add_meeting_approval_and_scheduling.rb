class AddMeetingApprovalAndScheduling < ActiveRecord::Migration[7.1]
  def change
    add_column :call_sessions, :host_approval_required, :boolean, null: false, default: false
    add_column :call_participants, :approved_at, :datetime
    create_table :scheduled_meetings do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :organizer, null: false, foreign_key: {to_table: :users}
      t.references :call_session, foreign_key: true, index: {unique: true}
      t.string :title, null: false
      t.text :description
      t.string :call_type, null: false, default: 'video'
      t.datetime :starts_at, null: false
      t.datetime :ends_at, null: false
      t.string :status, null: false, default: 'scheduled'
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    create_table :meeting_invitations do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :scheduled_meeting, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.references :calendar_event, foreign_key: {on_delete: :nullify}
      t.string :response, null: false, default: 'invited'
      t.timestamps
    end
    add_index :meeting_invitations, [:scheduled_meeting_id, :user_id], unique: true
    add_reference :calendar_events, :scheduled_meeting, foreign_key: {on_delete: :nullify}
  end
end
