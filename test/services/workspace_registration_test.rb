require "test_helper"

class WorkspaceRegistrationTest < ActiveSupport::TestCase
  test "registration restores caller context and creates only an owner in the new tenant" do
    existing = Workspace.create!(name: "Existing", slug: "registration-existing", kind: "private")
    actor = create_test_user(workspace: existing, email: "registration-actor@example.test")
    Current.workspace = existing
    Current.user = actor
    user = new_user("registration-owner@example.test")
    user.workspace = WorkspaceRegistration.build_workspace(user, company_name: "  New Company  ")

    WorkspaceRegistration.save!(user)

    assert_equal existing, Current.workspace
    assert_equal actor, Current.user
    assert_equal "New Company", user.workspace.name
    assert_equal ["owner"], user.role_names
    assert_equal user.workspace_id, UserRole.unscoped.find_by!(user_id: user.id).workspace_id
  end

  test "registration cannot join an existing workspace or promote its members" do
    workspace = Workspace.create!(name: "Existing", slug: "registration-join", kind: "private")
    user = new_user("registration-join@example.test")
    user.workspace = workspace
    assert_no_difference ["Workspace.count", "User.count", "UserRole.unscoped.count"] do
      assert_raises(ActiveRecord::RecordInvalid) { WorkspaceRegistration.save!(user) }
    end
    member = create_test_user(workspace: workspace, email: "registration-member@example.test")
    assert_raises(ActiveRecord::RecordInvalid) { WorkspaceRegistration.save!(member) }
    assert_not member.reload.owner?
  end

  test "owner assignment failure rolls back the account and workspace together" do
    user = new_user("registration-rollback@example.test")
    user.workspace = WorkspaceRegistration.build_workspace(user)
    user.define_singleton_method(:roles=) { |_roles| raise ActiveRecord::RecordInvalid, self }
    assert_no_difference ["Workspace.count", "User.count", "UserRole.unscoped.count"] do
      assert_raises(ActiveRecord::RecordInvalid) { WorkspaceRegistration.save!(user) }
    end
  end

  test "duplicate email races return validation and roll back the new workspace" do
    workspace = Workspace.create!(name: "Existing", slug: "registration-email-race", kind: "private")
    existing = create_test_user(workspace: workspace, email: "registration-race@example.test")
    user = new_user(existing.email)
    user.workspace = WorkspaceRegistration.build_workspace(user)
    # Model a unique-index collision after the validation race window.
    user.define_singleton_method(:save!) { raise ActiveRecord::RecordNotUnique, "duplicate email" }
    assert_no_difference ["Workspace.count", "User.count", "UserRole.unscoped.count"] do
      error = assert_raises(ActiveRecord::RecordInvalid) { WorkspaceRegistration.save!(user) }
      assert_equal user, error.record
      assert_includes user.errors[:email], "has already been taken"
    end
  end

  private

  def new_user(email)
    User.new(email: email, first_name: "New", last_name: "Owner", password: "Password!42")
  end
end
