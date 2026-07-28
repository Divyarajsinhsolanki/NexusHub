class Notification < ApplicationRecord
  include WorkspaceScoped

  belongs_to :recipient, class_name: "User"
  belongs_to :actor, class_name: "User"
  belongs_to :notifiable, polymorphic: true

  scope :unread, -> { where(read_at: nil) }
  scope :recent, -> { order(created_at: :desc) }

  before_create :respect_recipient_preferences
  before_validation :assign_recipient_workspace, on: :create

  def mark_as_read!
    update!(read_at: Time.current)
  end

  after_create_commit :broadcast_to_channel
  after_create_commit :enqueue_mobile_push

  private

  def assign_recipient_workspace
    self.workspace ||= recipient&.workspace
  end

  def broadcast_to_channel
    Chat::Broadcaster.broadcast_notification(self)
  end

  def enqueue_mobile_push
    ExpoPushNotificationJob.perform_later(id)
  end

  def respect_recipient_preferences
    return if recipient.blank?
    return if recipient.notification_preference_enabled?(action)

    throw(:abort)
  end
end
