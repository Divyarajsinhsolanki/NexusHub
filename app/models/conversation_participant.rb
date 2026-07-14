class ConversationParticipant < ApplicationRecord
  include WorkspaceScoped

  belongs_to :conversation
  belongs_to :user

  validates :user_id, uniqueness: { scope: :conversation_id }

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
