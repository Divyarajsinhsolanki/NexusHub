require "net/http"

class ExpoPushNotificationJob < ApplicationJob
  queue_as :default

  EXPO_PUSH_URL = URI("https://exp.host/--/api/v2/push/send")

  def perform(notification_id)
    notification = Notification.includes(:actor, :recipient, :notifiable).find_by(id: notification_id)
    return unless notification

    devices = notification.recipient.mobile_devices.active.to_a
    return if devices.empty?

    messages = devices.map { |device| push_message(notification, device) }
    response = Net::HTTP.post(
      EXPO_PUSH_URL,
      JSON.generate(messages),
      "Accept" => "application/json",
      "Content-Type" => "application/json"
    )
    handle_response(response, devices)
  rescue StandardError => error
    Rails.logger.warn("Expo push delivery failed for notification #{notification_id}: #{error.class}: #{error.message}")
  end

  private

  def push_message(notification, device)
    {
      to: device.expo_push_token,
      sound: "default",
      title: "Nexus Hub",
      body: notification.metadata&.dig("message").presence || notification.action.to_s.humanize,
      data: {
        notification_id: notification.id,
        deep_link: deep_link(notification)
      }
    }
  end

  def deep_link(notification)
    metadata = notification.metadata || {}
    return "/inbox/chat/#{metadata['conversation_id']}" if metadata["conversation_id"].present?

    notifiable = notification.notifiable
    return "/projects/#{notifiable.project_id}?taskId=#{notifiable.id}" if notifiable.is_a?(Task)
    return "/projects/#{notifiable.id}" if notifiable.is_a?(Project)

    "/inbox/notifications"
  end

  def handle_response(response, devices)
    return unless response.is_a?(Net::HTTPSuccess)

    data = JSON.parse(response.body)["data"]
    results = data.is_a?(Array) ? data : [data]
    devices.zip(results).each do |device, result|
      device.disable! if result.is_a?(Hash) && result.dig("details", "error") == "DeviceNotRegistered"
    end
  end
end
