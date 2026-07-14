module Chat
  class Broadcaster
    class << self
      def broadcast_message_created(message)
        payload = {
          type: "message_created",
          conversation_id: message.conversation_id,
          message: serialize_message(message)
        }

        ActionCable.server.broadcast(
          conversation_stream(message.workspace_id, message.conversation_id),
          payload
        )
        broadcast_conversation_refresh(message.conversation)
      end

      def broadcast_message_reactions_updated(message, last_actor_id: nil, last_actor_emoji: nil, last_actor_action: nil)
        payload = {
          type: "message_reactions_updated",
          conversation_id: message.conversation_id,
          message_id: message.id,
          reactions: message.reaction_counts,
          last_actor_id: last_actor_id,
          last_actor_emoji: last_actor_emoji,
          last_actor_action: last_actor_action
        }

        ActionCable.server.broadcast(
          conversation_stream(message.workspace_id, message.conversation_id),
          payload
        )
      end

      def broadcast_conversation_refresh(conversation)
        conversation.participant_ids.each do |participant_id|
          ActionCable.server.broadcast(user_stream(conversation.workspace_id, participant_id), {
            type: "conversation_refresh",
            conversation_id: conversation.id
          })
        end
      end

      def broadcast_conversation_hidden(conversation, user_id)
        ActionCable.server.broadcast(user_stream(conversation.workspace_id, user_id), {
          type: "conversation_hidden",
          conversation_id: conversation.id
        })
      end

      def broadcast_conversation_deleted(workspace_id, conversation_id, participant_ids)
        participant_ids.each do |participant_id|
          ActionCable.server.broadcast(user_stream(workspace_id, participant_id), {
            type: "conversation_deleted",
            conversation_id: conversation_id
          })
        end

        ActionCable.server.broadcast(conversation_stream(workspace_id, conversation_id), {
          type: "conversation_deleted",
          conversation_id: conversation_id
        })
      end

      def broadcast_typing_indicator(workspace_id, conversation_id, user, is_typing)
        payload = {
          type: "typing_indicator",
          conversation_id: conversation_id,
          user_id: user.id,
          user_name: user.full_name,
          is_typing: is_typing
        }

        ActionCable.server.broadcast(conversation_stream(workspace_id, conversation_id), payload)
      end

      def broadcast_message_read(workspace_id, conversation_id, user_id)
        payload = {
          type: "message_read",
          conversation_id: conversation_id,
          user_id: user_id,
          read_at: Time.current
        }

        ActionCable.server.broadcast(conversation_stream(workspace_id, conversation_id), payload)
      end

      def broadcast_call_ringing(call_session)
        call_session.call_participants.includes(:user).where.not(user_id: call_session.initiator_id).find_each do |participant|
          membership = call_session.conversation.conversation_participants.find_by(user_id: participant.user_id)
          next if membership&.muted?

          ActionCable.server.broadcast(user_stream(call_session.workspace_id, participant.user_id), {
            type: "call_ringing",
            call_session: serialize_call(call_session, current_user: participant.user)
          })
        end
      end

      def broadcast_call_event(call_session, event_type, extra_payload = {})
        payload = {
          type: event_type,
          conversation_id: call_session.conversation_id,
          call_session: serialize_call(call_session)
        }.merge(extra_payload)

        ActionCable.server.broadcast(
          conversation_stream(call_session.workspace_id, call_session.conversation_id),
          payload
        )

        call_session.call_participants.pluck(:user_id).each do |participant_id|
          ActionCable.server.broadcast(user_stream(call_session.workspace_id, participant_id), payload)
        end
      end

      def broadcast_notification(notification)
        metadata = notification.metadata.respond_to?(:with_indifferent_access) ? notification.metadata.with_indifferent_access : {}

        message =
          case notification.action
          when "reacted"
            "#{notification.actor.full_name} reacted with #{metadata[:emoji]} to your message"
          when "chat_ping"
            conversation_name = metadata[:conversation_name].presence || "a conversation"
            "#{notification.actor.full_name} mentioned you in #{conversation_name}"
          when "chat_message"
            conversation_name = metadata[:conversation_name].presence || "a conversation"
            "#{notification.actor.full_name} sent a message in #{conversation_name}"
          when "missed_call"
            conversation_name = metadata[:conversation_name].presence || "a conversation"
            call_type = metadata[:call_type].presence || "call"
            "Missed #{call_type} call from #{notification.actor.full_name} in #{conversation_name}"
          else
            "You have a new notification"
          end

        payload = {
          type: "notification_received",
          notification: {
            id: notification.id,
            action: notification.action,
            message: message,
            actor_avatar: notification.actor.profile_picture.attached? ? Rails.application.routes.url_helpers.rails_blob_path(notification.actor.profile_picture, only_path: true) : nil,
            read_at: notification.read_at,
            notifiable_type: notification.notifiable_type,
            notifiable_id: notification.notifiable_id,
            metadata: notification.metadata,
            created_at: notification.created_at
          }
        }

        ActionCable.server.broadcast(
          user_stream(notification.workspace_id, notification.recipient_id),
          payload
        )
      end

      def user_stream(workspace_id, user_id)
        "workspace_#{workspace_id}:chat_user_#{user_id}"
      end

      def conversation_stream(workspace_id, conversation_id)
        "workspace_#{workspace_id}:chat_conversation_#{conversation_id}"
      end

      private

      def serialize_message(message)
        {
          id: message.id,
          body: message.body,
          user_id: message.user_id,
          user_name: message.user.full_name,
          user_profile_picture: message.user.profile_picture.attached? ? Rails.application.routes.url_helpers.rails_blob_path(message.user.profile_picture, only_path: true) : nil,
          created_at: message.created_at,
          attachments: message.attachments.map do |attachment|
            {
              id: attachment.id,
              url: Rails.application.routes.url_helpers.rails_blob_path(attachment, only_path: true),
              download_url: Rails.application.routes.url_helpers.rails_blob_path(attachment, only_path: true, disposition: "attachment"),
              content_type: attachment.content_type,
              filename: attachment.filename.to_s,
              byte_size: attachment.byte_size
            }
          end,
          reactions: message.reaction_counts,
          reacted_emojis: []
        }
      end

      def serialize_call(call_session, current_user: nil)
        Chat::CallSerializer.call(call_session, current_user: current_user)
      end
    end
  end
end
