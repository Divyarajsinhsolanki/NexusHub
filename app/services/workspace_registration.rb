# Public registration creates a tenant; joining an existing tenant uses its
# authenticated member/invitation flow, never an email-domain or name match.
class WorkspaceRegistration
  def self.build_workspace(user, company_name: nil)
    Workspace.new(
      name: company_name.to_s.strip.presence || "#{user.first_name.presence || 'My'} Workspace",
      slug: "company-#{SecureRandom.uuid}",
      kind: "private"
    )
  end

  def self.save!(user)
    User.transaction do
      Role.find_or_create_by!(name: "member")
      owner = Role.find_or_create_by!(name: "owner")
      Current.set(workspace: user.workspace, user: user) do
        user.save!
        user.roles = [owner]
      end
      user.instance_variable_set(:@role_names, nil)
    end
    user
  end
end
