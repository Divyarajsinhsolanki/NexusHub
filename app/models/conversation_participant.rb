class ConversationParticipant < ApplicationRecord
  include WorkspaceScoped

  scope :active, -> { where(removed_at: nil) }

  belongs_to :conversation
  belongs_to :user

  validates :user_id, uniqueness: { scope: :conversation_id }

  around_save :require_active_workspace_member, if: -> { removed_at.nil? && (new_record? || will_save_change_to_removed_at? || will_save_change_to_user_id?) }

  def require_active_workspace_member
    workspace.with_lock do
      unless user.workspace_access?(workspace)
        errors.add(:user, "must have active workspace access")
        raise ActiveRecord::RecordInvalid, self
      end
      yield
    end
  end
  private :require_active_workspace_member

  def delivered_through?(message)
    last_delivered_message_id.present? && last_delivered_message_id >= message.id
  end

  def read_through?(message)
    last_read_message_id.present? && last_read_message_id >= message.id
  end

  def muted?(at = Time.current)
    muted_at.present? && (muted_until.blank? || muted_until > at)
  end

  def mute!(until_time)
    update!(muted_at: Time.current, muted_until: until_time)
  end

  def unmute!
    update!(muted_at: nil, muted_until: nil)
  end
end
