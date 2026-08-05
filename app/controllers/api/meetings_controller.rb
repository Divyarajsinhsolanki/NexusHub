class Api::MeetingsController < Api::BaseController
  before_action :set_call_session
  rescue_from Chat::CallManager::InvalidTransition, with: :render_invalid_transition

  def show
    render json: { call_session: Chat::CallSerializer.call(@call_session, current_user: current_user) }
  end

  def join
    call_session = Chat::CallManager.new(user: current_user).join_by_link(@call_session)
    credentials = Chat::LivekitTokenGenerator.new(call_session: call_session, user: current_user).call

    render json: credentials.merge(call_session: Chat::CallSerializer.call(call_session, current_user: current_user))
  rescue Chat::LivekitTokenGenerator::ConfigurationError => error
    render json: { error: "livekit_not_configured", message: error.message }, status: :service_unavailable
  end

  private

  def set_call_session
    @call_session = CallSession.unscoped
      .includes(:workspace, :initiator, call_participants: :user)
      .find_by!(public_id: params[:public_id])
  end

  def render_invalid_transition(error)
    status = @call_session&.live? ? :unprocessable_entity : :gone
    render json: { error: "invalid_call_transition", message: error.message }, status: status
  end
end
