class CallChannel < ApplicationCable::Channel
  def subscribed
    call_session = CallSession.unscoped.find_by(public_id: params[:public_id])
    participant = call_session&.call_participants&.find_by(user_id: current_user.id)

    unless call_session && participant
      reject
      return
    end

    stream_from Chat::Broadcaster.call_stream(call_session.public_id)
  end
end
