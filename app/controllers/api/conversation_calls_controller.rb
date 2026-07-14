class Api::ConversationCallsController < Api::BaseController
  def create
    conversation = Conversation.for_user(current_user).find(params[:conversation_id])
    call_session = Chat::CallManager.new(user: current_user).create_call(
      conversation: conversation,
      call_type: params[:call_type] || params.dig(:call, :call_type) || "audio"
    )

    render json: { call_session: Chat::CallSerializer.call(call_session, current_user: current_user) }, status: :created
  rescue Chat::CallManager::ActiveCallExists => error
    render json: { error: "active_call_exists", message: error.message }, status: :conflict
  rescue Chat::CallManager::InvalidTransition => error
    render json: { error: "invalid_call", message: error.message }, status: :unprocessable_entity
  end
end
