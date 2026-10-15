class WorkspaceSeats
  def self.used(workspace)
    WorkspaceMembership.in_workspace(workspace).active.joins(:user).where.not(users: { status: "locked" }).where(users: { deleted_at: nil }).count
  end

  def self.reserved(workspace)
    WorkspaceInvitation.in_workspace(workspace).reserved.count
  end

  def self.ensure_available!(workspace, record:, increment: 1)
    return if workspace.demo? || increment.zero?

    plan = Saas::PlanCatalog.find(Saas::PlanCatalog.effective_plan_key(workspace))
    limit = workspace.seat_limit_override || plan[:seat_limit]
    return unless limit && used(workspace) + reserved(workspace) + increment > limit

    record.errors.add(:base, "Workspace seat capacity reached, including pending invitations. Revoke an invitation or upgrade the plan.")
    raise ActiveRecord::RecordInvalid, record
  end
end
