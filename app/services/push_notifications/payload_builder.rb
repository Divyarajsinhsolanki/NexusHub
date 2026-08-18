module PushNotifications
  class PayloadBuilder
    def initialize(notification:, device:, aggregate_count: 1)
      @notification = notification
      @device = device
      @catalog = notification.catalog
      @aggregate_count = aggregate_count
    end

    def call
      return legacy_payload unless v2_device?

      payload = {
        to: device.expo_push_token,
        title: catalog.title,
        body: catalog.message(previews: notification.recipient.push_notification_previews?, aggregate_count: aggregate_count),
        sound: catalog.sound,
        priority: priority,
        channelId: catalog.channel_id,
        badge: notification.recipient.notifications.visible_in_feed.unread.count,
        collapseId: notification.group_key,
        tag: notification.group_key,
        threadId: notification.group_key,
        ttl: ttl,
        data: data
      }
      payload[:categoryId] = catalog.category_id if catalog.category_id
      payload
    end

    private

    attr_reader :notification, :device, :catalog, :aggregate_count

    def v2_device?
      PushNotifications.v2_enabled? && device.push_schema_version.to_i >= 2
    end

    def legacy_payload
      {
        to: device.expo_push_token,
        sound: "default",
        title: "Nexus Hub",
        body: catalog.message(previews: notification.recipient.push_notification_previews?, aggregate_count: aggregate_count),
        channelId: "general",
        data: data.merge(schema_version: 1)
      }
    end

    def data
      {
        schema_version: 2,
        type: "notification",
        event_type: catalog.event_type,
        notification_id: notification.id,
        entity_type: notification.notifiable_type,
        entity_id: notification.notifiable_id,
        category: catalog.category,
        group_key: notification.group_key,
        deep_link: catalog.deep_link
      }.merge(interaction_data)
    end

    def interaction_data
      values = (notification.metadata || {}).with_indifferent_access
      allowed = %i[conversation_id message_id call_session_id call_type project_id task_id issue_id post_id calendar_event_id team_id]
      values.slice(*allowed).compact.to_h.symbolize_keys.transform_keys do |key|
        key == :call_session_id ? :call_id : key
      end
    end

    def priority
      %w[chat reminders].include?(catalog.category) ? "high" : "default"
    end

    def ttl
      case catalog.category
      when "chat" then 86_400
      when "reminders" then reminder_ttl
      else 604_800
      end
    end

    def reminder_ttl
      starts_at = notification.metadata&.dig("event_start_at")
      return 3_600 unless starts_at

      [(Time.zone.parse(starts_at.to_s) - Time.current).to_i, 60].max
    rescue ArgumentError
      3_600
    end
  end
end
