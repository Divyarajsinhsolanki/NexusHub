class Api::CallsController < Api::BaseController
  before_action :set_call_session
  rescue_from Chat::CallManager::InvalidTransition, with: :render_invalid_transition

  def ack_ring
    call_session = call_manager.acknowledge_ring(@call_session)
    render json: { call_session: Chat::CallSerializer.call(call_session, current_user: current_user) }
  end

  def join
    call_session = call_manager.join(@call_session)
    credentials = Chat::LivekitTokenGenerator.new(call_session: call_session, user: current_user).call

    render json: credentials.merge(call_session: Chat::CallSerializer.call(call_session, current_user: current_user))
  rescue Chat::LivekitTokenGenerator::ConfigurationError => error
    render json: { error: "livekit_not_configured", message: error.message }, status: :service_unavailable
  end

  def decline
    call_session = call_manager.decline(@call_session)
    render json: { call_session: Chat::CallSerializer.call(call_session, current_user: current_user) }
  end

  def leave
    call_session = call_manager.leave(@call_session)
    render json: { call_session: Chat::CallSerializer.call(call_session, current_user: current_user) }
  end

  def end_call
    reason = params[:reason].presence || params.dig(:call, :reason).presence || "ended"
    call_session = call_manager.end_call(@call_session, reason: reason)
    render json: { call_session: Chat::CallSerializer.call(call_session, current_user: current_user) }
  end

  private

  def set_call_session
    @call_session = CallSession
      .in_workspace(current_user.workspace)
      .joins(:call_participants)
      .where(call_participants: { user_id: current_user.id })
      .includes(:initiator, :conversation, call_participants: :user)
      .find(params[:id])
  end

  def call_manager
    @call_manager ||= Chat::CallManager.new(user: current_user)
  end

  def render_invalid_transition(error)
    render json: { error: "invalid_call_transition", message: error.message }, status: :unprocessable_entity
  end
end
