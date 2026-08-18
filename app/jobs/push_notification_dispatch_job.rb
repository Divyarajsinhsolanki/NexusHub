class PushNotificationDispatchJob < ApplicationJob
  queue_as :default
  retry_on PushNotifications::ExpoClient::TransientError, wait: :polynomially_longer, attempts: 5

  def perform(notification_id, aggregate_since = nil)
    notification = Notification.unscoped.includes(:actor, :recipient, :notifiable).find_by(id: notification_id)
    return unless notification

    catalog = notification.catalog
    return unless notification.recipient.push_notification_enabled_for?(catalog.category)
    return if !PushNotifications.v2_enabled? && !catalog.legacy_push_supported?
    return unless latest_group_notification?(notification)
    return if notification.read_at?

    quiet_period = notification.recipient.push_quiet_period
    if quiet_period && quiet_period[:ends_at] > 1.second.from_now
      self.class.set(wait_until: quiet_period[:ends_at]).perform_later(notification.id, quiet_period[:starts_at].iso8601)
      return
    end

    devices = notification.recipient.mobile_devices.active.to_a
    return if devices.empty?

    count = aggregate_count(notification, aggregate_since)
    entries = devices.filter_map do |device|
      delivery = delivery_for(notification, device)
      next if delivery.persisted? && %w[ticketed accepted].include?(delivery.status)

      delivery.save! unless delivery.persisted?
      payload = PushNotifications::PayloadBuilder.new(notification: notification, device: device, aggregate_count: count).call
      [delivery, payload]
    end
    PushNotifications::DeliveryDispatcher.new.call(entries) if entries.any?
  end

  private

  def latest_group_notification?(notification)
    return true if notification.group_key.blank?

    latest_id = Notification.unscoped.where(recipient_id: notification.recipient_id, group_key: notification.group_key).maximum(:id)
    latest_id == notification.id
  end

  def aggregate_count(notification, aggregate_since)
    since = aggregate_since.present? ? Time.zone.parse(aggregate_since) : notification.created_at - notification.catalog.aggregation_window
    Notification.unscoped.where(
      recipient_id: notification.recipient_id,
      group_key: notification.group_key,
      created_at: since..notification.created_at
    ).count.clamp(1, 99)
  rescue ArgumentError
    1
  end

  def delivery_for(notification, device)
    PushDelivery.find_or_initialize_by(deduplication_key: "notification:#{notification.id}:device:#{device.id}") do |delivery|
      delivery.workspace = notification.workspace
      delivery.recipient = notification.recipient
      delivery.mobile_device = device
      delivery.notification = notification
      delivery.source = notification.notifiable
      delivery.event_type = notification.event_type
    end
  end
end
