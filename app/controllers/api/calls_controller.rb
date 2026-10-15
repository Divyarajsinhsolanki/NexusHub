class Api::CallsController < Api::BaseController
  before_action :set_call_session, except: :index
  rescue_from Chat::CallManager::InvalidTransition, with: :render_invalid_transition
  rescue_from Chat::CallManager::HostRequired, with: :render_host_required

  def index
    page = [params[:page].to_i, 1].max
    per_page = params[:per_page].present? ? params[:per_page].to_i.clamp(1, 50) : 25
    scope = CallSession.joins(:call_participants).where(call_participants: { user_id: current_user.id })
    if params[:conversation_id].present?
      conversation = Conversation.for_user(current_user).find(params[:conversation_id])
      scope = scope.where(conversation_id: conversation.id)
    end
    total = scope.count
    calls = scope.includes(:initiator, conversation: :participants).order(created_at: :desc, id: :desc).limit(per_page).offset((page - 1) * per_page).to_a
    participants = CallParticipant.where(call_session_id: calls.map(&:id), user_id: current_user.id).index_by(&:call_session_id)
    accessible = Conversation.for_user(current_user).where(id: calls.map(&:conversation_id)).pluck(:id)
    busy = CallSession.live.where(conversation_id: accessible).pluck(:conversation_id)
    response.headers['Cache-Control'] = 'no-store'
    render json: { data: calls.map { |call| history_row(call, participant: participants.fetch(call.id), accessible: accessible, busy: busy) }, meta: {
      current_page: page, next_page: page * per_page < total ? page + 1 : nil, total_count: total, per_page: per_page
    } }
  end

  def ack_ring
    call_session = call_manager.acknowledge_ring(@call_session)
    render json: { call_session: Chat::CallSerializer.call(call_session, current_user: current_user) }
  end

  def join
    raise Chat::LivekitTokenGenerator::ConfigurationError, Chat::LivekitTokenGenerator.configuration_error unless Chat::LivekitTokenGenerator.configured?
    unless call_manager.request_admission(@call_session)
      return render json: {admission_pending: true, call_session: Chat::CallSerializer.call(@call_session, current_user: current_user)}, status: :accepted
    end
    credentials = Chat::LivekitTokenGenerator.new(call_session: @call_session, user: current_user).call
    call_session = if ActiveModel::Type::Boolean.new.cast(params[:media_confirmation_required])
      call_manager.prepare_media_join(@call_session)
    else
      call_manager.join(@call_session)
    end

    render json: credentials.merge(call_session: Chat::CallSerializer.call(call_session, current_user: current_user))
  rescue Chat::LivekitTokenGenerator::ConfigurationError => error
    render json: { error: "livekit_not_configured", message: error.message }, status: :service_unavailable
  end

  def host_action
    call_session = Chat::HostControls.new(user: current_user).call(@call_session, action: params[:host_action].to_s, user_id: params[:user_id])
    render json: { call_session: Chat::CallSerializer.call(call_session, current_user: current_user) }
  rescue Chat::LivekitRoomPresence::Unavailable => error
    render json: { error: "media_server_unavailable", message: error.message }, status: :service_unavailable
  end

  def media_heartbeat
    call_session = call_manager.confirm_media(@call_session)
    render json: { call_session: Chat::CallSerializer.call(call_session, current_user: current_user) }
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

  def history_row(call, participant:, accessible:, busy:)
    title = if call.conversation.group?
      call.conversation.title.presence || "Group call"
    else
      call.conversation.participants.find { |user| user.id != current_user.id }&.full_name || "Direct chat"
    end
    start = [participant.joined_at, call.started_at].compact.max
    finish = participant.left_at || call.ended_at || Time.current
    duration = if start && call.status.in?(%w[active ended]) && !participant.status.in?(%w[missed declined ringing])
      [(finish - start).to_i, 0].max
    else
      0
    end
    {
      id: call.id, conversation_id: call.conversation_id,
      title: accessible.include?(call.conversation_id) ? title : "Meeting hosted by #{call.initiator.full_name}",
      call_type: call.call_type, status: call.status, participant_status: participant.status,
      direction: call.initiator_id == current_user.id ? "outgoing" : "incoming",
      created_at: call.created_at, started_at: call.started_at, ended_at: call.ended_at,
      duration_seconds: duration,
      can_callback: !current_user.demo_account? && accessible.include?(call.conversation_id) && call.conversation.participants.any? { |user| user.id != current_user.id } && !busy.include?(call.conversation_id),
      can_open_conversation: accessible.include?(call.conversation_id)
    }
  end

  def set_call_session
    @call_session = CallSession
      .unscoped
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

  def render_host_required(error)
    render json: { error: "host_required", message: error.message }, status: :forbidden
  end
end
