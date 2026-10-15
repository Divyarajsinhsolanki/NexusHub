class WorkspaceInvitations
  class InvalidInvitation < StandardError; end

  def self.authorize!(actor, workspace, role_names = nil)
    actor&.reload
    raise InvalidInvitation, "Invitation management access is required." unless WorkspaceAuthorization.allowed?(actor, "invitations.manage", workspace: workspace)
    allowed = actor.owner? ? Role::NAMES : Role::NAMES - ["owner"]
    raise InvalidInvitation, "You cannot assign the selected roles." if role_names && (role_names - allowed).any?
  end

  def self.issue!(actor:, attributes:)
    invitation = actor.workspace.workspace_invitations.new(attributes)
    invitation.invited_by = actor
    raw = SecureRandom.urlsafe_base64(32)
    authorize!(actor, actor.workspace, invitation.role_names)
    actor.workspace.with_lock do
      authorize!(actor, invitation.workspace, invitation.role_names)
      raise InvalidInvitation, "Too many invitations. Try again later." if WorkspaceInvitation.in_workspace(actor.workspace).where("created_at > ?", 1.hour.ago).count >= 100
      invitation.email = invitation.email.to_s.strip.downcase
      existing = WorkspaceInvitation.in_workspace(actor.workspace).find_by(email: invitation.email, status: "pending")
      raise InvalidInvitation, "An invitation is already pending for this email. Resend or revoke it." if existing&.expires_at&.future?
      existing&.update!(status: "expired")
      user = actor.workspace.users.find_by(email: invitation.email)
      raise InvalidInvitation, "This person already has workspace access." if user&.workspace_access?
      raise InvalidInvitation, "This account cannot be invited." if user&.deleted_at? || user&.locked?
      validate_assignments!(invitation)
      WorkspaceSeats.ensure_available!(actor.workspace, record: invitation)
      invitation.assign_attributes(token_digest: WorkspaceInvitation.digest(raw), expires_at: WorkspaceInvitation::TTL.from_now, last_sent_at: Time.current)
      invitation.save!
      event!(invitation, actor, "invitation.created")
    end
    enqueue!(invitation, raw)
    invitation
  end

  def self.resend!(invitation, actor:)
    raw = SecureRandom.urlsafe_base64(32)
    invitation.workspace.with_lock do
      invitation.lock!
      authorize!(actor, invitation.workspace, invitation.role_names)
      raise InvalidInvitation, "This invitation is no longer pending." unless invitation.pending? || invitation.expired?
      raise InvalidInvitation, "Wait one minute before resending." if invitation.last_sent_at && invitation.last_sent_at > 1.minute.ago
      other = WorkspaceInvitation.in_workspace(invitation.workspace).where(email: invitation.email, status: "pending").where.not(id: invitation.id).first
      raise InvalidInvitation, "Another invitation is already pending for this email." if other&.expires_at&.future?
      other&.update!(status: "expired")
      validate_assignments!(invitation)
      WorkspaceSeats.ensure_available!(invitation.workspace, record: invitation) unless invitation.expires_at.future?
      invitation.update!(status: "pending", token_digest: WorkspaceInvitation.digest(raw), expires_at: WorkspaceInvitation::TTL.from_now, last_sent_at: Time.current, delivery_status: "queued", invited_by: actor)
      event!(invitation, actor, "invitation.resent")
    end
    enqueue!(invitation, raw)
    invitation
  end

  def self.revoke!(invitation, actor:)
    invitation.workspace.with_lock do
      invitation.lock!
      authorize!(actor, invitation.workspace, invitation.role_names)
      raise InvalidInvitation, "Accepted invitations cannot be revoked. Offboard the member instead." if invitation.accepted?
      unless invitation.revoked?
        invitation.update!(status: "revoked", revoked_at: Time.current)
        event!(invitation, actor, "invitation.revoked")
      end
    end
    invitation
  end

  def self.find_valid!(raw)
    raise InvalidInvitation, "This invitation is invalid, expired, or already used." unless raw.is_a?(String) && raw.match?(/\A[A-Za-z0-9_-]{43}\z/)
    invitation = WorkspaceInvitation.unscoped.find_by(token_digest: WorkspaceInvitation.digest(raw))
    raise InvalidInvitation, "This invitation is invalid, expired, or already used." unless invitation&.token_valid?(raw)
    invitation
  end

  def self.accept!(raw:, attributes:, actor: nil)
    invitation = find_valid!(raw)
    user = nil
    Current.set(workspace: invitation.workspace, user: nil) do
      invitation.workspace.with_lock do
        invitation.lock!
        raise InvalidInvitation, "This invitation is invalid, expired, or already used." unless invitation.token_valid?(raw)
        authorize!(invitation.invited_by, invitation.workspace, invitation.role_names)
        validate_assignments!(invitation)
        user = User.find_by(email: invitation.email)
        raise InvalidInvitation, "Sign out before accepting an invitation for another email." if actor && actor.email.downcase != invitation.email
        raise InvalidInvitation, "This account belongs to another workspace. Accounts cannot be moved between companies." if user && user.workspace_id != invitation.workspace_id
        raise InvalidInvitation, "This account cannot accept an invitation." if user&.deleted_at? || user&.locked?
        if user
          cleanup = WorkspaceAccessEvent.in_workspace(invitation.workspace).where(subject: user, action: "employee.offboarded").order(:id).last
          if cleanup && cleanup.details["cleanup_status"].in?(%w[pending failed])
            raise InvalidInvitation, "Previous offboarding media cleanup is not complete. Ask the workspace owner to retry it."
          end
          unless actor&.id == user.id || user.valid_password?(attributes[:current_password].to_s)
            raise InvalidInvitation, "Enter your existing account password to accept this invitation."
          end
          raise InvalidInvitation, "This person already has workspace access." if user.workspace_access?
        end
        # Consume the reserved seat within the same transaction as activation.
        invitation.update!(status: "accepted", accepted_at: Time.current)
        if user
          user.membership_for.update!(offboarded_at: nil, offboarded_by_id: nil, status: "active")
          user.confirm unless user.confirmed?
        else
          user = User.new(attributes.slice(:first_name, :last_name, :password, :password_confirmation, :job_title).merge(email: invitation.email, workspace: invitation.workspace, status: "active"))
          user.skip_confirmation!
          if attributes[:password].to_s.length < 8
            user.errors.add(:password, "must contain at least 8 characters")
            raise ActiveRecord::RecordInvalid, user
          end
          user.save!
        end
        Current.set(user: user) do
          user.update!(department_id: invitation.department_id) if invitation.department_id
          user.roles = Role.where(name: invitation.role_names)
          invitation.project_ids.each do |id|
            membership = ProjectUser.find_or_initialize_by(project_id: id, user_id: user.id)
            membership.assign_attributes(workspace: invitation.workspace, status: "active", role: "collaborator")
            membership.save!
          end
          invitation.update!(accepted_user: user)
          event!(invitation, user, "invitation.accepted")
        end
      end
    end
    user
  end

  def self.validate_assignments!(invitation)
    projects = Project.in_workspace(invitation.workspace).where(id: invitation.project_ids).pluck(:id)
    raise InvalidInvitation, "Selected projects are unavailable in this workspace." unless (invitation.project_ids - projects).empty?
    if invitation.department_id && !Department.in_workspace(invitation.workspace).exists?(id: invitation.department_id)
      raise InvalidInvitation, "Selected department is unavailable in this workspace."
    end
  end

  def self.event!(invitation, actor, action)
    WorkspaceAccessEvent.create!(workspace: invitation.workspace, actor: actor, subject: invitation.accepted_user,
      action: action, details: { invitation_id: invitation.id, role_names: invitation.role_names })
  end

  def self.enqueue!(invitation, raw)
    WorkspaceInvitationMailJob.perform_later(invitation.id, WorkspaceInvitation.encrypt_token(raw))
  rescue StandardError
    invitation.update!(delivery_status: "failed")
  end
end
