class Api::ConversationReceiptsController < Api::BaseController
  rescue_from Chat::ReceiptManager::InvalidReceipt, with: :render_invalid_receipt

  def update
    conversation = Conversation.for_user(current_user).find(params[:conversation_id])
    receipt = receipt_params
    membership = Chat::ReceiptManager.new(user: current_user).update(
      conversation: conversation,
      message_id: receipt.require(:message_id),
      state: receipt.require(:state)
    )

    render json: { receipt: serialize_receipt(membership) }
  end

  private

  def receipt_params
    source = params[:receipt].present? ? params.require(:receipt) : params
    source.permit(:message_id, :state)
  end

  def serialize_receipt(membership)
    {
      conversation_id: membership.conversation_id,
      user_id: membership.user_id,
      delivered_message_id: membership.last_delivered_message_id,
      read_message_id: membership.last_read_message_id,
      delivered_at: membership.last_delivered_at,
      read_at: membership.last_read_at
    }
  end

  def render_invalid_receipt(error)
    render json: { error: "invalid_receipt", message: error.message }, status: :unprocessable_entity
  end
end
