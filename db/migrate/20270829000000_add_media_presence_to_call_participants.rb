class AddMediaPresenceToCallParticipants < ActiveRecord::Migration[7.1]
  def change
    add_column :call_participants, :media_confirmation_required, :boolean, null: false, default: false
    add_column :call_participants, :media_last_seen_at, :datetime
  end
end
