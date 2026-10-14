class CloseScheduledMeetingRoomJob < ApplicationJob
  queue_as :default
  def perform(call_session_id)
    session = CallSession.unscoped.find_by(id: call_session_id)
    return unless session && !session.live?
    Chat::LivekitRoomPresence.request(session, 'DeleteRoom', {room: session.livekit_room_name}, allow_not_found: true)
  end
end
