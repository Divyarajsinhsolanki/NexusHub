require "test_helper"

class WorkspaceMembershipTest < ActiveSupport::TestCase
  setup do
    @workspace = Workspace.create!(name: "Members", slug: "membership-model", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "membership-model@example.test")
  end

  test "every new account receives one membership in its own workspace" do
    membership = @user.membership_for
    assert_equal "active", membership.status
    assert_equal @workspace.id, membership.workspace_id
    assert_equal ["member"], @user.role_names
    assert @user.workspace_access?
  end

  test "suspended and missing memberships fail closed even with preloaded owner roles" do
    @user.roles = [Role.find_by!(name: "owner")]
    @user.roles.load
    membership = @user.membership_for
    membership.update!(status: "suspended")
    assert_empty @user.role_names
    assert_empty WorkspaceAuthorization.permissions(@user)
    assert_not @user.owner?
    membership.destroy!
    assert_not @user.workspace_access?
  end

  test "an account cannot have a second company membership or foreign role assignment" do
    other = Workspace.create!(name: "Other", slug: "membership-model-other", kind: "private")
    membership = WorkspaceMembership.new(workspace: other, user: @user)
    assert_not membership.valid?
    assert_includes membership.errors[:user], "must belong to the same workspace"
    assert_raises(ActiveRecord::InvalidForeignKey) do
      WorkspaceMembership.transaction(requires_new: true) do
        @user.membership_for.update_columns(workspace_id: other.id)
      end
    end
    assert_raises(ActiveRecord::InvalidForeignKey) do
      UserRole.transaction(requires_new: true) do
        UserRole.unscoped.find_by!(user_id: @user.id).update_columns(workspace_id: other.id)
      end
    end
  end

  test "role changes are immediately reflected without stale role caches" do
    assert_not @user.owner?
    @user.roles.load
    Current.set(workspace: @workspace) { @user.roles = [Role.find_by!(name: "owner")] }
    assert @user.owner?
    assert WorkspaceAuthorization.allowed?(@user, "memberships.manage")
    other = Workspace.create!(name: "Other", slug: "membership-policy-other", kind: "private")
    assert_not WorkspaceAuthorization.allowed?(@user, "users.manage", workspace: other)
  end
end
