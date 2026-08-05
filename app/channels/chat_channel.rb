class ChatChannel < ApplicationCable::Channel
  def subscribed
    if params[:conversation_id].present?
      subscribe_to_conversation(params[:conversation_id])
    else
      stream_from Chat::Broadcaster.user_stream(current_workspace.id, current_user.id)
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

    stream_from Chat::Broadcaster.conversation_stream(current_workspace.id, conversation.id)
  end

  def participant_in_conversation?(conversation_id)
    Conversation.for_user(current_user).exists?(id: conversation_id)
  end
end
