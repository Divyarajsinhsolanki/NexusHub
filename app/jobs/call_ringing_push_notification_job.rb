class CallRingingPushNotificationJob < ApplicationJob
  queue_as :default
  retry_on PushNotifications::ExpoClient::TransientError, wait: :polynomially_longer, attempts: 5

  def perform(call_session_id, recipient_id)
    call_session = CallSession.unscoped.includes(:initiator, :conversation).find_by(id: call_session_id)
    return unless call_session&.live?
    return unless call_session.call_participants.exists?(user_id: recipient_id, status: "ringing")

    membership = call_session.conversation.conversation_participants.find_by(user_id: recipient_id)
    return if membership&.muted?

    recipient = call_session.call_participants.find_by(user_id: recipient_id)&.user
    return unless recipient
    category = "#{call_session.call_type}_calls"
    return unless recipient.push_notification_enabled_for?(category)
    return if recipient.push_quiet_period && !recipient.calls_allowed_during_quiet_hours?

    devices = MobileDevice.unscoped.active.where(user_id: recipient_id, workspace_id: call_session.workspace_id).to_a
    return if devices.empty?

    entries = devices.filter_map do |device|
      delivery = PushDelivery.find_or_initialize_by(deduplication_key: "call:ring:#{call_session.id}:recipient:#{recipient.id}:device:#{device.id}") do |record|
        record.workspace = call_session.workspace
        record.recipient = recipient
        record.mobile_device = device
        record.source = call_session
        record.event_type = "incoming_#{call_session.call_type}_call"
      end
      next if delivery.persisted? && %w[ticketed accepted].include?(delivery.status)

      delivery.save! unless delivery.persisted?
      [delivery, push_message(call_session, device, recipient)]
    end
    PushNotifications::DeliveryDispatcher.new.call(entries) if entries.any?
  end

  private

  def push_message(call_session, device, recipient = nil)
    recipient ||= call_session.call_participants.find_by(user_id: device.user_id)&.user || device.user
    PushNotifications::CallPayloadBuilder.new(call_session: call_session, recipient: recipient, device: device).call
  end
end
