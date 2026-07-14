class Conversation < ApplicationRecord
  include WorkspaceScoped

  enum :conversation_type, { direct: "direct", group: "group" }, prefix: :conversation

  belongs_to :creator, class_name: "User"
  belongs_to :last_message, class_name: "Message", optional: true
  has_many :conversation_participants, dependent: :destroy
  has_many :participants, through: :conversation_participants, source: :user
  has_many :messages, dependent: :destroy
  has_many :call_sessions, dependent: :destroy

  validates :conversation_type, presence: true
  validates :title, presence: true, if: :group?

  before_destroy :clear_last_message_reference

  scope :for_user_including_hidden, ->(user) { joins(:conversation_participants).where(conversation_participants: { user_id: user.id }).distinct }
  scope :for_user, ->(user) { for_user_including_hidden(user).where(conversation_participants: { hidden_at: nil }) }

  def direct?
    conversation_type == "direct"
  end

  def group?
    conversation_type == "group"
  end

  def display_name(for_user)
    return title if group?

    other_participant = participants.where.not(id: for_user.id).first
    other_participant&.full_name || "Direct chat"
  end

  def refresh_last_message!
    latest_message = messages.reorder(created_at: :desc, id: :desc).select(:id, :created_at).first

    update_columns(
      last_message_id: latest_message&.id,
      last_message_at: latest_message&.created_at,
      updated_at: Time.current
    )
  end

  private

  def clear_last_message_reference
    update_columns(last_message_id: nil, last_message_at: nil) if last_message_id.present?
  end
end
