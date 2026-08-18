class Notification < ApplicationRecord
  include WorkspaceScoped

  belongs_to :recipient, class_name: "User"
  belongs_to :actor, class_name: "User"
  belongs_to :notifiable, polymorphic: true

  scope :unread, -> { where(read_at: nil) }
  scope :recent, -> { order(created_at: :desc) }
  scope :visible_in_feed, -> { where(feed_visible: true) }

  before_validation :assign_recipient_workspace, on: :create
  before_validation :assign_delivery_metadata, on: :create

  def mark_as_read!
    update!(read_at: Time.current)
  end

  def catalog
    @catalog ||= NotificationCatalog.for(self)
  end

  def event_type
    catalog.event_type
  end

  after_create_commit :broadcast_to_channel
  after_create_commit :enqueue_mobile_push

  private

  def assign_recipient_workspace
    self.workspace ||= recipient&.workspace
  end

  def broadcast_to_channel
    return unless feed_visible?

    Chat::Broadcaster.broadcast_notification(self)
  end

  def enqueue_mobile_push
    PushNotificationDispatchJob.set(wait: catalog.dispatch_delay).perform_later(id)
  end

  def assign_delivery_metadata
    return unless recipient

    self.group_key = catalog.group_key
    self.feed_visible = recipient.notification_preference_enabled?(catalog.feed_preference_key)
  end
end
