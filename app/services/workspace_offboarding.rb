class WorkspaceOffboarding
  class InvalidRequest < StandardError; end

  def self.authorize!(actor, membership)
    raise InvalidRequest, "Only workspace owners can offboard employees." unless WorkspaceAuthorization.allowed?(actor, "offboarding.manage", workspace: membership.workspace)
    raise InvalidRequest, "Platform administrators require a separate privileged offboarding process." if membership.user.site_admin?
    raise InvalidRequest, "Demo employees cannot be offboarded." if membership.user.demo_account?
  end

  def self.preview(membership, actor:)
    authorize!(actor, membership)
    user = membership.user
    workspace = membership.workspace
    project_ids = Project.in_workspace(workspace).where(owner_id: user.id).pluck(:id)
    {
      user_id: user.id, name: user.full_name, already_offboarded: membership.offboarded_at.present?,
      needs_transfer: WorkspaceOwnershipTransfer.required?(user),
      cleanup_status: WorkspaceAccessEvent.in_workspace(workspace).where(subject: user, action: "employee.offboarded").order(:id).last&.details&.fetch("cleanup_status", nil),
      owned_projects: project_ids.size,
      owned_teams: Team.in_workspace(workspace).where(owner_id: user.id).count,
      successors: workspace.users.where(status: "active", demo_account: false, deleted_at: nil).where.not(id: user.id)
        .select { |candidate| candidate.confirmed? && candidate.workspace_access? }
        .map { |candidate| { id: candidate.id, name: candidate.full_name } },
      retained: "Projects, messages, documents and historical work records are retained. Current project/team access and scheduled messages are removed. Ownership transfers are not reversed by a future invitation."
    }
  end

  def self.call!(membership, actor:, successor_id: nil, confirmation: nil)
    authorize!(actor, membership)
    raise InvalidRequest, "Type OFFBOARD to confirm." unless confirmation == "OFFBOARD"
    event = nil
    Current.set(workspace: membership.workspace, user: actor) do
      membership.workspace.with_lock do
        membership.lock!
        authorize!(actor, membership)
        if membership.offboarded_at?
          event = WorkspaceAccessEvent.in_workspace(membership.workspace).where(subject: membership.user, action: "employee.offboarded").order(:id).last
        else
          user = membership.user
          WorkspaceOwnershipTransfer.transfer!(user, successor_id: successor_id) if WorkspaceOwnershipTransfer.required?(user)
          WorkspaceMemberManagement.protect_last_owner!(membership)
          counts = {}
          counts[:projects] = ProjectUser.in_workspace(membership.workspace).where(user_id: user.id).where.not(status: "removed").update_all(status: "removed", updated_at: Time.current)
          counts[:conversations] = ConversationParticipant.in_workspace(membership.workspace).where(user_id: user.id, removed_at: nil).update_all(removed_at: Time.current, updated_at: Time.current)
          counts[:teams] = TeamUser.in_workspace(membership.workspace).where(user_id: user.id).where.not(status: "rejected").update_all(status: "rejected", updated_at: Time.current)
          counts[:scheduled_messages] = ScheduledChatMessage.in_workspace(membership.workspace).where(user_id: user.id, state: "pending").update_all(state: "cancelled", updated_at: Time.current)
          invitations = WorkspaceInvitation.in_workspace(membership.workspace).where(status: "pending").where("invited_by_id = :id OR email = :email", id: user.id, email: user.email)
          counts[:invitations] = invitations.update_all(status: "revoked", revoked_at: Time.current, updated_at: Time.current)
          counts[:pdf_operations] = PdfDocumentOperation.in_workspace(membership.workspace).where(user_id: user.id, status: %w[queued processing]).update_all(status: "failed", progress: 100, completed_at: Time.current, error_message: "Workspace access removed", updated_at: Time.current)
          participants = CallParticipant.where(workspace_id: membership.workspace_id, user_id: user.id).joins(:call_session).where(call_sessions: { status: CallSession::LIVE_STATUSES })
          call_ids = participants.pluck(:call_session_id)
          participants.update_all(status: "left", left_at: Time.current, removed_at: Time.current, updated_at: Time.current)
          hosted = CallSession.in_workspace(membership.workspace).live.where("host_id = :id OR (host_id IS NULL AND initiator_id = :id)", id: user.id)
          hosted_ids = hosted.pluck(:id)
          hosted.update_all(status: "ended", ended_at: Time.current, ended_reason: "host_offboarded", updated_at: Time.current)
          CallParticipant.where(call_session_id: hosted_ids, removed_at: nil).update_all(status: "left", left_at: Time.current, updated_at: Time.current)
          user.update!(department_id: nil, last_seen_at: nil, keka_secret_ciphertext: nil,
            encrypted_keka_api_key: nil, encrypted_keka_api_key_iv: nil,
            keka_base_url: nil, keka_employee_id: nil, keka_profile_data: {})
          membership.update!(status: "suspended", offboarded_at: Time.current, offboarded_by: actor)
          event = WorkspaceAccessEvent.create!(workspace: membership.workspace, actor: actor, subject: user, action: "employee.offboarded",
            details: { membership_id: membership.id, user_id: user.id, successor_id: successor_id, revoked: counts, call_ids: call_ids, ended_call_ids: hosted_ids,
              cleanup_status: (call_ids + hosted_ids).any? ? "pending" : "not_required" })
        end
      end
    end
    event&.reload
    if event
      ActionCable.server.broadcast("workspace_#{membership.workspace_id}:presence", { type: "presence", user_id: membership.user_id, last_seen_at: nil, online: false })
    end
    enqueue_cleanup!(event) if event && event.details["cleanup_status"].in?(%w[pending failed])
    event
  rescue WorkspaceOwnershipTransfer::InvalidRequest => error
    raise InvalidRequest, error.message
  end

  def self.enqueue_cleanup!(event)
    WorkspaceOffboardingCleanupJob.perform_later(event.id)
  rescue StandardError
    event.update!(details: event.details.merge("cleanup_status" => "failed"))
  end
end
