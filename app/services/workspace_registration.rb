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
    unless user.new_record? && user.workspace&.new_record? && !user.workspace.demo?
      user.errors.add(:base, "Public registration requires a new private workspace and a new account")
      raise ActiveRecord::RecordInvalid, user
    end

    User.transaction do
      user.workspace.save!
      Role.find_or_create_by!(name: "member")
      owner = Role.find_or_create_by!(name: "owner")
      Current.set(workspace: user.workspace, user: user) do
        user.save!
        user.roles = [owner]
      end
      user.instance_variable_set(:@role_names, nil)
    end
    user
  rescue ActiveRecord::RecordNotUnique
    # A simultaneous signup may commit after the email uniqueness validation.
    # The transaction has rolled back, so report the collision as validation.
    raise unless User.exists?(email: user.email)

    user.errors.add(:email, :taken)
    raise ActiveRecord::RecordInvalid, user
  rescue ActiveRecord::RecordInvalid => error
    raise if error.record == user

    user.errors.add(:workspace, error.record.errors.full_messages.join(", "))
    raise ActiveRecord::RecordInvalid, user
  end
end
