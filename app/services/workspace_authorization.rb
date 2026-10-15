# Common company permissions for browser/native clients and server checks.
# Resource policies still enforce project/team membership and record ownership.
class WorkspaceAuthorization
  MEMBER_PERMISSIONS = %w[
    activity.read calendar.manage posts.manage work.manage knowledge.read chat.manage
    profile.manage notifications.manage vault.manage pdf.manage memberships.read
  ].freeze
  ROLE_PERMISSIONS = {
    "owner" => %w[integrations.manage projects.manage project_members.manage teams.manage users.create users.manage departments.manage support.manage admin.manage memberships.manage invitations.manage offboarding.manage],
    "admin" => %w[integrations.manage projects.manage project_members.manage teams.manage users.create departments.manage admin.manage invitations.manage],
    "project_manager" => %w[projects.manage project_members.manage],
    "team_leader" => %w[teams.manage],
    "member" => []
  }.freeze

  def self.permissions(user, workspace: user&.workspace)
    return [] unless user&.workspace_access?(workspace)

    permissions = MEMBER_PERMISSIONS + user.role_names.flat_map { |role| ROLE_PERMISSIONS.fetch(role, []) }
    permissions += %w[admin.manage portfolio.manage support.inspect] if user.site_admin?
    permissions.uniq.sort
  end

  def self.allowed?(user, permission, workspace: user&.workspace)
    permissions(user, workspace: workspace).include?(permission.to_s)
  end
end
