class ChatChannel < ApplicationCable::Channel
  def subscribed
    if params[:conversation_id].present?
      subscribe_to_conversation(params[:conversation_id])
    else
      stream_from Chat::Broadcaster.user_stream(current_workspace.id, current_user.id), coder: ActiveSupport::JSON do |event|
        # Queued message events may outlive group membership even on the inbox stream.
        conversation_event = event["type"].to_s.start_with?("message_") || event["type"] == "typing_indicator"
        next if conversation_event && !active_conversation_member?(event["conversation_id"])

        transmit event
      end
    end
  end

  def typing(data)
    return if current_user.demo_account?

    conversation_id = data["conversation_id"]
    return unless conversation_id
    return unless participant_in_conversation?(conversation_id)

    Chat::Broadcaster.broadcast_typing_indicator(
      current_workspace.id,
      conversation_id,
      current_user,
      data["is_typing"]
    )
  end

  def mark_as_read(data)
    return if current_user.demo_account?

    conversation_id = data["conversation_id"]
    return unless conversation_id

    conversation = Conversation.for_user(current_user).find_by(id: conversation_id)
    return unless conversation

    membership = Chat::ReceiptManager.new(user: current_user).mark_latest(conversation: conversation)
    Chat::Broadcaster.broadcast_message_read(current_workspace.id, conversation_id, current_user.id) if membership
  end

  def mark_delivered(data)
    return if current_user.demo_account?

    conversation_id = data["conversation_id"]
    message_id = data["message_id"]
    return unless conversation_id && message_id

    conversation = Conversation.for_user(current_user).find_by(id: conversation_id)
    return unless conversation

    Chat::ReceiptManager.new(user: current_user).update(
      conversation: conversation,
      message_id: message_id,
      state: "delivered"
    )
  end

  private

  def subscribe_to_conversation(conversation_id)
    conversation = Conversation.for_user(current_user).find_by(id: conversation_id)
    unless conversation
      reject
      return
    end

    stream_from Chat::Broadcaster.conversation_stream(current_workspace.id, conversation.id), coder: ActiveSupport::JSON do |event|
      # Stream callbacks run outside channel actions. Recheck membership at delivery
      # time rather than trusting the authorization performed when subscribing.
      unless active_conversation_member?(conversation.id)
        stop_all_streams
        reject
        next
      end

      transmit event
    end
  end

  def active_conversation_member?(conversation_id)
    current_user.reload.workspace_access?(current_workspace) &&
      ConversationParticipant.unscoped.active.exists?(workspace_id: current_workspace.id, conversation_id: conversation_id, user_id: current_user.id)
  rescue ActiveRecord::RecordNotFound
    false
  end

  def participant_in_conversation?(conversation_id)
    Conversation.for_user(current_user).exists?(id: conversation_id)
  end
end
