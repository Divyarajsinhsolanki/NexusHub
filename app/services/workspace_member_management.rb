class WorkspaceMemberManagement
  def self.update!(membership, role_names: nil, status: nil)
    raise ActiveRecord::RecordNotFound, "Workspace membership unavailable" unless membership
    Current.set(workspace: membership.workspace) do
      membership.workspace.with_lock do
        membership.lock!
        if status == "active" && membership.offboarded_at?
          membership.errors.add(:base, "This employee was offboarded. Send a new invitation to restore access.")
          raise ActiveRecord::RecordInvalid, membership
        end
        roles = role_names.nil? ? membership.role_names : Array(role_names).map(&:to_s).map(&:strip).reject(&:blank?).uniq.presence || ["member"]
        errors = roles - Role::NAMES
        membership.errors.add(:base, "Unknown role selection: #{errors.join(', ')}") if errors.any?
        membership.errors.add(:status, "is invalid") unless status.nil? || WorkspaceMembership.statuses.key?(status.to_s)
        raise ActiveRecord::RecordInvalid, membership if membership.errors.any?

        protect_last_owner!(membership) if (status && status != "active") || !roles.include?("owner")
        membership.user.roles = Role.where(name: roles) unless role_names.nil?
        membership.update!(status: status) unless status.nil?
      end
    end
    membership
  end

  def self.protect_last_owner!(membership)
    return unless membership&.active? && membership.role_names.include?("owner")

    owner_ids = UserRole.in_workspace(membership.workspace).where(role_id: Role.where(name: "owner").select(:id)).select(:user_id)
    others = WorkspaceMembership.in_workspace(membership.workspace).active.where.not(id: membership.id)
      .where(user_id: owner_ids).where(user_id: User.where.not(status: "locked").where(deleted_at: nil).select(:id))
    return if others.exists?

    membership.errors.add(:base, "Keep at least one active workspace owner. Assign another owner first.")
    raise ActiveRecord::RecordInvalid, membership
  end
end
