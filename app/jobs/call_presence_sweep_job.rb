class CallPresenceSweepJob < ApplicationJob
  queue_as :default

  def perform
    CallSession.unscoped.live.includes(:workspace, :initiator).find_each do |call|
      Current.workspace = call.workspace
      Current.user = call.initiator
      begin
        identities = Chat::LivekitRoomPresence.identities(call)
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
