class Message < ApplicationRecord
  include WorkspaceScoped

  MENTION_REGEX = /@([a-zA-Z0-9._-]+)/.freeze

  belongs_to :conversation
  belongs_to :user
  has_many_attached :attachments
  has_many :message_reactions, dependent: :destroy

  validate :body_or_attachment_present

  after_create :restore_hidden_participants
  after_create_commit :update_conversation_last_message
  after_create_commit :broadcast_message
  after_create_commit :notify_participants
  after_destroy_commit :refresh_conversation_last_message

  private

  def body_or_attachment_present
    return if body.present? || attachments.attached?

    errors.add(:base, "Message must include text or an attachment")
  end

  def broadcast_message
    Chat::Broadcaster.broadcast_message_created(self)
  end

  def update_conversation_last_message
    conversation.update_columns(
      last_message_id: id,
      last_message_at: created_at,
      updated_at: Time.current
    )
  end

  def refresh_conversation_last_message
    return unless Conversation.unscoped.exists?(conversation_id)

    conversation.refresh_last_message!
  end

  def restore_hidden_participants
    conversation.conversation_participants
      .where.not(user_id: user_id)
      .where.not(hidden_at: nil)
      .update_all(hidden_at: nil, updated_at: Time.current)
  end

  public

  def reaction_counts
    message_reactions.group(:emoji).count
  end

  def reacted_emojis_for(user)
    return [] unless user

    message_reactions.where(user_id: user.id).pluck(:emoji)
  end

  def notify_participants
    memberships_by_user_id = conversation.conversation_participants.index_by(&:user_id)
    recipients = conversation.participants.where.not(id: user_id).reject do |recipient|
      memberships_by_user_id[recipient.id]&.muted?
    end
    mentioned_user_ids = extract_mentioned_user_ids(recipients)

    recipients.each do |recipient|
      mentioned = mentioned_user_ids.include?(recipient.id)

      Notification.create(
        recipient_id: recipient.id,
        actor: user,
        action: mentioned ? "chat_ping" : "chat_message",
        notifiable: self,
        metadata: {
          conversation_id: conversation_id,
          conversation_name: conversation.display_name(recipient),
          mentioned: mentioned
        }
      )
    end
  end

  def extract_mentioned_user_ids(recipients)
    return [] if body.blank?

    handles = body.scan(MENTION_REGEX).flatten.map(&:downcase).uniq
    return [] if handles.empty?

    recipients.select do |participant|
      mention_handles_for(participant).any? { |handle| handles.include?(handle) }
    end.map(&:id)
  end

  def mention_handles_for(participant)
    [
      participant.email.to_s.split("@").first,
      participant.full_name.to_s,
      [ participant.first_name, participant.last_name ].compact.join(" "),
      participant.first_name.to_s
    ].map { |value| value.to_s.downcase.strip.gsub(/\s+/, ".") }
      .reject(&:blank?)
      .uniq
  end
end
