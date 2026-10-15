class WorkspaceOffboardingCleanupJob < ApplicationJob
  queue_as :default
  retry_on Chat::LivekitRoomPresence::Unavailable, wait: :polynomially_longer, attempts: 5

  def perform(id)
    event = WorkspaceAccessEvent.unscoped.find_by(id: id, action: "employee.offboarded")
    return unless event && event.details["cleanup_status"].in?(%w[pending failed])
    Current.set(workspace: event.workspace) do
      Array(event.details["ended_call_ids"]).each do |call_id|
        call = CallSession.in_workspace(event.workspace).find_by(id: call_id)
        next unless call
        Chat::LivekitRoomPresence.request(call, "DeleteRoom", { room: call.livekit_room_name }, allow_not_found: true)
        Chat::Broadcaster.broadcast_call_event(call, "call_ended")
      end
      (Array(event.details["call_ids"]) - Array(event.details["ended_call_ids"])).each do |call_id|
        call = CallSession.in_workspace(event.workspace).find_by(id: call_id)
        next unless call
        Chat::LivekitRoomPresence.request(call, "RemoveParticipant", { room: call.livekit_room_name,
          identity: "workspace-#{event.workspace_id}:user-#{event.details["user_id"] || event.subject_id}", revoke_token_ts: event.created_at.to_i }, allow_not_found: true)
        Chat::Broadcaster.broadcast_call_event(call, "participant_removed")
      end
      event.update!(details: event.details.merge("cleanup_status" => "completed"))
    end
  rescue Chat::LivekitRoomPresence::Unavailable
    event.update!(details: event.details.merge("cleanup_status" => "failed"))
    raise
  end
end
