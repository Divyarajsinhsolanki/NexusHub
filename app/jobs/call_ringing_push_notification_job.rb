require "net/http"

class CallRingingPushNotificationJob < ApplicationJob
  queue_as :default

  EXPO_PUSH_URL = URI("https://exp.host/--/api/v2/push/send")

  def perform(call_session_id, recipient_id)
    call_session = CallSession.unscoped.includes(:initiator, :conversation).find_by(id: call_session_id)
    return unless call_session&.live?
    return unless call_session.call_participants.exists?(user_id: recipient_id, status: "ringing", ring_acknowledged_at: nil)

    membership = call_session.conversation.conversation_participants.find_by(user_id: recipient_id)
    return if membership&.muted?

    devices = MobileDevice.unscoped.active.where(user_id: recipient_id, workspace_id: call_session.workspace_id).to_a
    return if devices.empty?

    messages = devices.map { |device| push_message(call_session, device) }
    response = Net::HTTP.post(
      EXPO_PUSH_URL,
      JSON.generate(messages),
      "Accept" => "application/json",
      "Content-Type" => "application/json"
    )
    handle_response(response, devices)
  rescue StandardError => error
    Rails.logger.warn("Call push delivery failed for call #{call_session_id}: #{error.class}: #{error.message}")
  end

  private

  def push_message(call_session, device)
    {
      to: device.expo_push_token,
      sound: "default",
      priority: "high",
      channelId: "calls",
      title: call_session.call_type == "video" ? "Incoming video call" : "Incoming voice call",
      body: "#{call_session.initiator.full_name} is calling",
      data: {
        type: "call_ringing",
        call_id: call_session.id,
        conversation_id: call_session.conversation_id,
        call_type: call_session.call_type,
        initiator_id: call_session.initiator_id,
        initiator_name: call_session.initiator.full_name,
        deep_link: "/call/#{call_session.id}?type=#{call_session.call_type}"
      }
    }
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
