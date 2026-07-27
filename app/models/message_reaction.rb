class MessageReaction < ApplicationRecord
  include WorkspaceScoped

  DEFAULT_EMOJIS = %w[👍 ❤️ 😂 🎉 🙌].freeze

  belongs_to :message
  belongs_to :user

  validates :emoji, presence: true, length: { maximum: 24 }
  validates :emoji, uniqueness: { scope: [:message_id, :user_id] }

  after_create_commit :notify_recipient
  after_create_commit -> { broadcast_reactions_updated("added") }
  after_destroy_commit -> { broadcast_reactions_updated("removed") }

  private

  def notify_recipient
    return if user_id == message.user_id

    Notification.create!(
      recipient_id: message.user_id,
      actor: user,
      notifiable: self,
      action: "reacted",
      metadata: {
        emoji: emoji,
        message_id: message_id,
        conversation_id: message.conversation_id,
        conversation_name: message.conversation.title
      }
    )
  end

  def broadcast_reactions_updated(action)
    Chat::Broadcaster.broadcast_message_reactions_updated(
      message,
      last_actor_id: user_id,
      last_actor_emoji: emoji,
      last_actor_action: action
    )
  end
end
