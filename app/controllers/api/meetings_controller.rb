class Api::MeetingsController < Api::BaseController
  before_action :set_call_session, only: [:show, :join]
  rescue_from Chat::CallManager::InvalidTransition, with: :render_invalid_transition

  def create
    unless Chat::LivekitTokenGenerator.configured?
      return render json: { error: "livekit_not_configured", message: Chat::LivekitTokenGenerator.configuration_error }, status: :service_unavailable
    end

    call_session = Conversation.transaction do
      conversation = Conversation.create!(workspace: current_user.workspace, creator: current_user, conversation_type: "group", title: "Quick meeting")
      conversation.conversation_participants.create!(workspace: current_user.workspace, user: current_user)
      session = Chat::CallManager.new(user: current_user).create_call(conversation: conversation, call_type: params[:call_type].presence || "video", meeting: true)
      session.update!(host_approval_required: params[:host_approval_required].nil? ? true : ActiveModel::Type::Boolean.new.cast(params[:host_approval_required]))
      session
    end
    render json: { call_session: Chat::CallSerializer.call(call_session, current_user: current_user) }, status: :created
  end

  def show
    render json: { call_session: Chat::CallSerializer.call(@call_session, current_user: current_user) }
  end

  def join
    raise Chat::LivekitTokenGenerator::ConfigurationError, Chat::LivekitTokenGenerator.configuration_error unless Chat::LivekitTokenGenerator.configured?
    unless Chat::CallManager.new(user: current_user).request_admission(@call_session)
      return render json: {admission_pending: true, call_session: Chat::CallSerializer.call(@call_session, current_user: current_user)}, status: :accepted
    end
    credentials = Chat::LivekitTokenGenerator.new(call_session: @call_session, user: current_user).call
    call_session = if ActiveModel::Type::Boolean.new.cast(params[:media_confirmation_required])
      Chat::CallManager.new(user: current_user).prepare_media_join(@call_session, by_link: true)
    else
      Chat::CallManager.new(user: current_user).join_by_link(@call_session)
    end

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
    status = action_name == "create" || @call_session&.live? ? :unprocessable_entity : :gone
    render json: { error: "invalid_call_transition", message: error.message }, status: status
  end
end
