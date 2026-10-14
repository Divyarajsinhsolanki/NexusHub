class CallPresenceSweepJob < ApplicationJob
  queue_as :default

  def perform
    CallSession.unscoped.live.includes(:workspace, :initiator).find_each do |call|
      Current.workspace = call.workspace
      Current.user = call.initiator
      begin
        identities = Chat::LivekitRoomPresence.identities(call)
        call.call_participants.where.not(removed_at: nil).find_each do |participant|
          identity = "workspace-#{call.workspace_id}:user-#{participant.user_id}"
          next unless identities.include?(identity)
          Chat::LivekitRoomPresence.request(call, "RemoveParticipant", {room: call.livekit_room_name, identity: identity, revoke_token_ts: Time.current.to_i})
        end
        call.call_participants.includes(:user).where(status: %w[ringing joined]).find_each do |participant|
          next unless identities.include?("workspace-#{call.workspace_id}:user-#{participant.user_id}")
          Chat::CallManager.new(user: participant.user).confirm_media(call)
        end
        Chat::CallManager.new(user: call.initiator).expire_media_presence(call)
      rescue Chat::LivekitRoomPresence::Unavailable
        Rails.logger.warn("Call presence reconciliation unavailable for call #{call.id}")
      rescue Chat::CallManager::InvalidTransition
        # The host can end the call while RoomService is being queried.
      end
    end
  ensure
    Current.reset_all
  end
end
