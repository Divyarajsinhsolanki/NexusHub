class Message < ApplicationRecord
  include WorkspaceScoped

  MENTION_REGEX = /@([a-zA-Z0-9._-]+)/.freeze

  belongs_to :conversation
  belongs_to :user
  belongs_to :reply_to, class_name: 'Message', optional: true
  has_many_attached :attachments
  has_many :message_reactions, dependent: :destroy

  validate :body_or_attachment_present
  validate :reply_belongs_to_conversation
  validates :message_type, inclusion: { in: %w[message system] }
  validates :client_id, uniqueness: { scope: [:conversation_id, :user_id] }, allow_nil: true

  after_create :restore_hidden_participants
  after_create_commit :update_conversation_last_message
  after_create_commit :broadcast_message
  after_destroy_commit :refresh_conversation_last_message

  private

  def reply_belongs_to_conversation
    return unless reply_to
    errors.add(:reply_to, 'must be a regular message in this conversation') if reply_to.conversation_id != conversation_id || reply_to.message_type != 'message'
  end

  def body_or_attachment_present
    return if body.present? || attachments.attached?

    errors.add(:base, "Message must include text or an attachment")
  end

  def broadcast_message
    # Receipts can arrive immediately after delivery; create notifications first.
    notify_participants
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

  def chat_context
    {
      message_type: message_type,
      reply_to_id: reply_to_id,
      reply_to: reply_to && {
        id: reply_to.id, body: reply_to.body.to_s.truncate(300),
        user_id: reply_to.user_id, user_name: reply_to.user.full_name,
        attachment_count: reply_to.attachments.size
      }
    }
  end

  def reaction_counts
    message_reactions.group(:emoji).count
  end

  def reacted_emojis_for(user)
    return [] unless user

    message_reactions.where(user_id: user.id).pluck(:emoji)
  end

  def notify_participants
    return if message_type == 'system'
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
        action: mentioned ? "chat_mention" : "chat_message",
        notifiable: self,
        metadata: {
          conversation_id: conversation_id,
          conversation_name: conversation.display_name(recipient),
          mentioned: mentioned,
          message_preview: body.present? ? body.to_s.truncate(120) : attachment_preview
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

  def attachment_preview
    count = attachments.count
    count > 1 ? "Sent #{count} attachments" : "Sent an attachment"
  end
end
