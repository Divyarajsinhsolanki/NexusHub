class MarkRemovedConversationParticipants < ActiveRecord::Migration[8.1]
  def change
    add_column :conversation_participants, :removed_at, :datetime
  end
end
