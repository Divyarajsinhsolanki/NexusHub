module Chat
  class NotificationReply
    class InvalidReply < StandardError; end

    def self.call(user:, notification_id:, body:, client_id:)
      body = body.to_s.strip
      client_id = client_id.to_s
      raise InvalidReply, 'Write a reply of up to 4,000 characters.' if body.blank? || body.length > 4_000
      raise InvalidReply, 'A reply identifier is required.' if client_id.blank? || client_id.length > 100

      # Trust the stored notification, never conversation/user IDs supplied by the phone.
      notification = user.notifications.find(notification_id)
      unless %w[chat_message chat_mention].include?(notification.catalog.event_type)
        raise InvalidReply, 'This notification does not support replies.'
      end
      metadata = (notification.metadata || {}).with_indifferent_access
      conversation = Conversation.for_user(user).find(metadata[:conversation_id])
      target = conversation.messages.find_by(id: metadata[:message_id], message_type: 'message')
      key = "notification-#{notification.id}-#{client_id}"
      message = nil
      notification.with_lock do
        message = conversation.messages.find_by(user: user, client_id: key)
        message ||= conversation.messages.create!(user: user, body: body, client_id: key,
          reply_to: target && !target.deleted_at? ? target : nil)
      end
      # Only acknowledge the notification's message, not newer unseen messages.
      ReceiptManager.new(user: user).update(conversation: conversation, message_id: target.id, state: 'read') if target
      notification.mark_as_read! unless notification.reload.read_at?
      { message_id: message.id, conversation_id: conversation.id, reply_to_id: message.reply_to_id,
        unread_count: user.notifications.visible_in_feed.unread.count }
    end
  end
end
