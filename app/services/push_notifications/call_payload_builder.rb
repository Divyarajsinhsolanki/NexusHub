module PushNotifications
  class CallPayloadBuilder
    def initialize(call_session:, recipient:, device:)
      @call_session = call_session
      @recipient = recipient
      @device = device
    end

    def call
      return legacy_payload unless v2_device?

      category = "#{call_session.call_type}_calls"
      group_key = "call:#{call_session.id}"
      {
        to: device.expo_push_token,
        sound: NotificationCatalog::CATEGORY_SOUNDS.fetch(category),
        priority: "high",
        channelId: NotificationCatalog::CATEGORY_CHANNELS.fetch(category),
        categoryId: "incoming_call_actions",
        collapseId: group_key,
        tag: group_key,
        threadId: "conversation:#{call_session.conversation_id}",
        ttl: 45,
        title: call_session.call_type == "video" ? "Incoming video call" : "Incoming audio call",
        body: recipient.push_notification_previews? ? "#{call_session.initiator.full_name} is calling" : "You have an incoming call",
        data: data.merge(schema_version: 2, event_type: "incoming_#{call_session.call_type}_call", category: category, group_key: group_key)
      }
    end

    private

    attr_reader :call_session, :recipient, :device

    def v2_device?
      PushNotifications.v2_enabled? && device.push_schema_version.to_i >= 2
    end

    def legacy_payload
      {
        to: device.expo_push_token,
        sound: "default",
        priority: "high",
        channelId: "calls",
        title: call_session.call_type == "video" ? "Incoming video call" : "Incoming voice call",
        body: "#{call_session.initiator.full_name} is calling",
        data: data.merge(schema_version: 1)
      }
    end

    def data
      {
        type: "call_ringing",
        call_id: call_session.id,
        conversation_id: call_session.conversation_id,
        call_type: call_session.call_type,
        initiator_id: call_session.initiator_id,
        initiator_name: call_session.initiator.full_name,
        deep_link: "/call/#{call_session.id}?type=#{call_session.call_type}"
      }
    end
  end
end
