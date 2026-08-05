module Chat
  class ReceiptManager
    STATES = %w[delivered read].freeze

    class InvalidReceipt < StandardError; end

    def initialize(user:)
      @user = user
    end

    def update(conversation:, message_id:, state:)
      normalized_state = state.to_s
      raise InvalidReceipt, "Unsupported receipt state" unless STATES.include?(normalized_state)

      message = conversation.messages.find(message_id)
      membership = conversation.conversation_participants.find_by!(user_id: user.id)
      changed = false
      now = Time.current

      membership.with_lock do
        membership.reload
        attributes = {}

        if advances?(membership.last_delivered_message_id, message.id)
          attributes[:last_delivered_message_id] = message.id
          attributes[:last_delivered_at] = now
        end

        if normalized_state == "read" && advances?(membership.last_read_message_id, message.id)
          attributes[:last_read_message_id] = message.id
          attributes[:last_read_at] = now
        end

        if attributes.any?
          membership.update!(attributes)
          changed = true
        end
      end

      Chat::Broadcaster.broadcast_message_receipt_updated(conversation, membership) if changed
      membership
    end

    def mark_latest(conversation:, state: "read")
      latest_message_id = conversation.messages.maximum(:id)
      return conversation.conversation_participants.find_by!(user_id: user.id) unless latest_message_id

      update(conversation: conversation, message_id: latest_message_id, state: state)
    end

    private

    attr_reader :user

    def advances?(current_message_id, next_message_id)
      current_message_id.blank? || next_message_id.to_i > current_message_id.to_i
    end
  end
end
