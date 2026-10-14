class Api::ScheduledMeetingsController < Api::BaseController
  before_action :set_meeting, except: [:index, :create]
  rescue_from Meetings::Scheduler::Invalid, with: :invalid
  rescue_from ActiveRecord::RecordInvalid do |error|
    render json: {error: 'validation_failed', message: error.record.errors.full_messages.join(', ')}, status: :unprocessable_entity
  end
  rescue_from ActiveRecord::StaleObjectError do
    render json: {error: 'stale_meeting', message: 'This meeting changed. Reload before editing.'}, status: :conflict
  end
  def index
    page = [params[:page].to_i, 1].max
    scope = ScheduledMeeting.accessible_to(current_user).includes(:organizer, call_session: :call_participants, meeting_invitations: :user).order(starts_at: :desc, id: :desc)
    total = scope.count
    render json: {data: scope.limit(25).offset((page-1)*25).map { |meeting| serialize(meeting) }, meta: {current_page: page, next_page: page*25 < total ? page+1 : nil, total_count: total, per_page: 25}}
  end
  def show
    render json: serialize(@meeting)
  end
  def create
    meeting = ScheduledMeeting.new(workspace: current_user.workspace, organizer: current_user)
    scheduler.save(meeting, attributes: attributes, invitee_ids: params[:invitee_ids] || [])
    render json: serialize(meeting), status: :created
  end
  def update
    return forbidden unless @meeting.organizer_id == current_user.id
    return render(json: {error:'stale_meeting',message: 'This meeting changed. Cancel editing, reload, and review before saving.'}, status: :conflict) unless params[:lock_version].to_s == @meeting.lock_version.to_s
    scheduler.save(@meeting, attributes: attributes.merge(lock_version: params[:lock_version]), invitee_ids: params.key?(:invitee_ids) ? params[:invitee_ids] : nil)
    render json: serialize(@meeting)
  end
  def cancel
    return forbidden unless @meeting.organizer_id == current_user.id
    scheduler.cancel(@meeting)
    render json: serialize(@meeting)
  end
  def respond
    scheduler.respond(@meeting, params[:response].to_s)
    render json: serialize(@meeting)
  end
  def join
    session = scheduler.join(@meeting)
    render json: {public_id: session.public_id}
  end
  private
  def set_meeting
    @meeting = ScheduledMeeting.accessible_to(current_user).includes(:organizer, call_session: :call_participants, meeting_invitations: :user).find(params[:id])
  end
  def scheduler
    Meetings::Scheduler.new(user: current_user)
  end
  def attributes
    params.permit(:title, :description, :call_type, :starts_at, :ends_at).to_h
  end
  def serialize(meeting)
    session = meeting.call_session
    removed = session&.call_participants&.any? { |participant| participant.user_id == current_user.id && participant.removed_at? }
    ended = session && !session.live? && session.ended_reason != 'empty'
    invitation = meeting.meeting_invitations.find { |entry| entry.user_id == current_user.id }
    {id: meeting.id, title: meeting.title, description: meeting.description, starts_at: meeting.starts_at, ends_at: meeting.ends_at, status: ended && meeting.status == 'scheduled' ? 'completed' : meeting.status, call_type: meeting.call_type, organizer_name: meeting.organizer.full_name, organizer_id: meeting.organizer_id, response: invitation&.response, lock_version: meeting.lock_version, can_manage: meeting.organizer_id == current_user.id, can_join: !removed && !ended && meeting.status == 'scheduled' && meeting.starts_at <= 15.minutes.from_now && meeting.ends_at > Time.current && invitation&.response != 'declined', public_id: meeting.call_session&.public_id, invitations: meeting.organizer_id == current_user.id ? meeting.meeting_invitations.map { |entry| {user_id: entry.user_id, name: entry.user.full_name, response: entry.response} } : []}
  end
  def invalid(error)
    render json: {error: 'invalid_meeting', message: error.message}, status: :unprocessable_entity
  end
  def forbidden
    render json: {error: 'forbidden'}, status: :forbidden
  end
end
