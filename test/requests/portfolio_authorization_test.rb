require "test_helper"

class PortfolioAuthorizationTest < ActionDispatch::IntegrationTest
  setup do
    @previous_portfolio_mode = ENV["PORTFOLIO_ENABLED"]
    ENV["PORTFOLIO_ENABLED"] = "true"
  end

  teardown do
    ENV["PORTFOLIO_ENABLED"] = @previous_portfolio_mode
  end

  test "portfolio administration requires site admin" do
    workspace = Workspace.create!(name: "Admin Test", slug: "admin-test", kind: "private")
    member = create_user(workspace, "member@example.test")

    login(member)
    get "/api/admin/portfolio"
    assert_response :forbidden

    delete "/api/logout"
    site_admin = create_user(workspace, "site-admin@example.test", site_admin: true)
    login(site_admin)

    get "/api/admin/portfolio"
    assert_response :success
  end

  test "generic admin cannot assign protected site flags" do
    workspace = Workspace.create!(name: "Protected Flags", slug: "protected-flags", kind: "private")
    site_admin = create_user(workspace, "system-admin@example.test", site_admin: true)
    target = create_user(workspace, "target@example.test")
    login(site_admin)

    patch "/api/admin/users/#{target.id}", params: {
      record: { site_admin: true, demo_account: true, workspace_id: -1 }
    }

    assert_response :success
    target.reload
    assert_not target.site_admin?
    assert_not target.demo_account?
    assert_equal workspace.id, target.workspace_id
  end

  test "system admin can directly reset a user password and revoke mobile sessions" do
    workspace = Workspace.create!(name: "Password Admin", slug: "password-admin", kind: "private")
    site_admin = create_user(workspace, "password-admin@example.test", site_admin: true)
    target = create_user(workspace, "password-target@example.test")
    session, = MobileSession.issue_for!(user: target, device_name: "Android")
    login(site_admin)

    patch "/api/admin/users/#{target.id}/password", params: {
      password: { password: "NewPassword!42", password_confirmation: "NewPassword!42" }
    }

    assert_response :success
    assert target.reload.valid_password?("NewPassword!42")
    assert session.reload.revoked_at.present?
  end

  test "workspace admin cannot reset a password in another workspace" do
    first = Workspace.create!(name: "Password First", slug: "password-first", kind: "private")
    second = Workspace.create!(name: "Password Second", slug: "password-second", kind: "private")
    admin = create_user(first, "workspace-admin@example.test")
    admin.roles = [Role.find_by!(name: "admin")]
    target = create_user(second, "foreign-password-target@example.test")
    login(admin)

    patch "/api/admin/users/#{target.id}/password", params: {
      password: { password: "NewPassword!42", password_confirmation: "NewPassword!42" }
    }

    assert_response :not_found
    assert target.reload.valid_password?("Password!42")
  end

  test "workspace admin cannot reset an owner password" do
    workspace = Workspace.create!(name: "Password Roles", slug: "password-roles", kind: "private")
    admin = create_user(workspace, "role-admin@example.test")
    admin.roles = [Role.find_by!(name: "admin")]
    owner = create_user(workspace, "role-owner@example.test")
    owner.roles = [Role.find_by!(name: "owner")]
    login(admin)

    patch "/api/admin/users/#{owner.id}/password", params: {
      password: { password: "NewPassword!42", password_confirmation: "NewPassword!42" }
    }

    assert_response :forbidden
    assert owner.reload.valid_password?("Password!42")
  end

  test "cross workspace identifiers return not found" do
    first = Workspace.create!(name: "First API", slug: "first-api", kind: "private")
    second = Workspace.create!(name: "Second API", slug: "second-api", kind: "private")
    owner = create_user(first, "owner@example.test")
    owner.roles = [Role.find_by!(name: "owner")]
    foreign_project = Project.create!(workspace: second, name: "Foreign project")
    login(owner)

    patch "/api/projects/#{foreign_project.id}", params: { project: { name: "Leaked" } }

    assert_response :not_found
    assert_equal "Foreign project", foreign_project.reload.name
  end

  test "site admin can reorder portfolio projects and tour features" do
    PortfolioSeeder.new.call
    workspace = Workspace.create!(name: "Portfolio Ordering", slug: "portfolio-ordering", kind: "private")
    site_admin = create_user(workspace, "ordering-admin@example.test", site_admin: true)
    login(site_admin)

    project = PortfolioProject.first!
    feature = project.portfolio_features.first!
    patch "/api/admin/portfolio/order", params: {
      projects: [{ id: project.id, position: 4 }],
      features: [{ id: feature.id, position: 3, tour_position: 2 }]
    }

    assert_response :success
    assert_equal 4, project.reload.position
    assert_equal 3, feature.reload.position
    assert_equal 2, feature.tour_position
  end

  private

  def create_user(workspace, email, site_admin: false)
    workspace.users.create!(
      email: email,
      password: "Password!42",
      password_confirmation: "Password!42",
      first_name: "Test",
      last_name: "User",
      job_title: "Engineer",
      status: "active",
      confirmed_at: Time.current,
      site_admin: site_admin
    )
  end

  def login(user)
    post "/api/login", params: {
      auth: { email: user.email, password: "Password!42" }
    }
    assert_response :success
  end
end
