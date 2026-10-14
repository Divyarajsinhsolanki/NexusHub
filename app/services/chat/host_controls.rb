module Chat
  class HostControls
    def initialize(user:)
      @user = user
    end

    def call(session, action:, user_id:)
      session.with_lock do
        raise CallManager::HostRequired, "Only the current host can manage participants" unless session.host_user_id == @user.id && !session.participant_for(@user)&.removed_at?
        raise CallManager::InvalidTransition, "This call has ended" unless session.live?
        target = session.call_participants.find_by!(user_id: user_id)
        pending_action = action.in?(%w[approve reject])
        valid_state = pending_action ? target.call_waiting? : target.call_joined?
        raise CallManager::InvalidTransition, "Select an eligible participant" if target.user_id == @user.id || !valid_state || target.removed_at?
        identity = "workspace-#{session.workspace_id}:user-#{target.user_id}"
        room = session.livekit_room_name
        case action
        when "approve"
          target.update!(status: 'ringing', approved_at: Time.current)
        when "reject"
          target.update!(status: 'declined', removed_at: Time.current, left_at: Time.current)
        when "mute"
          payload = LivekitRoomPresence.request(session, "GetParticipant", { room: room, identity: identity })
          tracks = Array(payload['tracks']).select { |track| track.is_a?(Hash) && track['sid'].present? && track['source'].in?(['MICROPHONE', 2]) }
          raise CallManager::InvalidTransition, "This participant has no microphone track" if tracks.empty?
          tracks.each { |track| LivekitRoomPresence.request(session, "MutePublishedTrack", { room: room, identity: identity, track_sid: track.fetch('sid'), muted: true }) }
        when "remove"
          LivekitRoomPresence.request(session, "RemoveParticipant", { room: room, identity: identity, revoke_token_ts: Time.current.to_i })
          target.update!(status: "left", left_at: Time.current, removed_at: Time.current)
        when "transfer_host"
          raise CallManager::InvalidTransition, "The new host must belong to this workspace" unless target.user.workspace_id == session.workspace_id
          session.update!(host: target.user)
        else
          raise CallManager::InvalidTransition, "Unknown host action"
        end
      end
      session.call_participants.reset
      Broadcaster.broadcast_call_event(session.reload, "call_updated")
      session
    end
  end
end
