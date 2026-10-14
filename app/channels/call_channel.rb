class CallChannel < ApplicationCable::Channel
  def subscribed
    call_session = CallSession.unscoped.find_by(public_id: params[:public_id])
    participant = call_session&.call_participants&.find_by(user_id: current_user.id)

    admitted = call_session && (!call_session.host_approval_required? || call_session.host_user_id == current_user.id || participant&.approved_at?)
    unless call_session && participant && !participant.removed_at? && admitted
      reject
      return
    end

    stream_from Chat::Broadcaster.call_stream(call_session.public_id)
  end
end
