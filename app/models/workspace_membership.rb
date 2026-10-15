class WorkspaceMembership < ApplicationRecord
  include WorkspaceScoped

  belongs_to :user, inverse_of: :workspace_membership
  belongs_to :offboarded_by, class_name: "User", optional: true
  around_save :enforce_seat_capacity, if: -> { active? && (new_record? || will_save_change_to_status?) }
  enum :status, { active: "active", suspended: "suspended" }, default: :active
  validates :user_id, uniqueness: true

  def role_names
    UserRole.in_workspace(workspace).where(user_id: user_id).joins(:role).order("roles.name").pluck("roles.name")
  end

  after_update :revoke_workspace_access, if: -> { saved_change_to_status? && suspended? }
  after_destroy :revoke_workspace_access

  private

  def enforce_seat_capacity
    workspace.with_lock do
      WorkspaceSeats.ensure_available!(workspace, record: self, increment: user.locked? ? 0 : 1)
      yield
    end
  end

  def revoke_workspace_access
    return unless user

    user.revoke_authentication_sessions
    McpAccessToken.where(user_id: user_id, workspace_id: workspace_id).active.find_each(&:revoke!)
  end
end
