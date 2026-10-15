class ScheduledChatMessage < ApplicationRecord
  include WorkspaceScoped
  belongs_to :conversation
  belongs_to :user
  belongs_to :reply_to, class_name: 'Message', optional: true
  belongs_to :sent_message, class_name: 'Message', optional: true
  has_many_attached :attachments
  validates :body, length: { maximum: 20_000 }
  validates :send_at, :client_id, presence: true
  validates :state, inclusion: { in: %w[pending sent cancelled] }
  validates :client_id, uniqueness: { scope: [:conversation_id, :user_id] }
  validate :valid_content_and_time, on: :create
  private
  def valid_content_and_time
    errors.add(:attachments, 'are limited to 10 files and 100MB per message') if attachments.size > 10 || attachments.sum { |file| file.blob.byte_size } > 100.megabytes
    errors.add(:base, 'Add text or an attachment') unless body.present? || attachments.attached?
    errors.add(:send_at, 'must be in the future and within one year') unless send_at && send_at > Time.current && send_at <= 1.year.from_now
    if reply_to_id && (!reply_to || reply_to.conversation_id != conversation_id || reply_to.deleted_at? || reply_to.message_type != 'message')
      errors.add(:reply_to, 'must be a visible message in this conversation')
    end
  end
end
