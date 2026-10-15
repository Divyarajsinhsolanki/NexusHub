require "test_helper"

class WorkspaceMembershipsTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Company", slug: "membership-requests", kind: "private")
    @owner = create_test_user(workspace: @workspace, email: "membership-owner@example.test")
    @member = create_test_user(workspace: @workspace, email: "membership-member@example.test")
    Current.set(workspace: @workspace) { @owner.roles = [Role.find_by!(name: "owner")] }
    other = Workspace.create!(name: "Other", slug: "membership-requests-other", kind: "private")
    @outsider = create_test_user(workspace: other, email: "membership-outsider@example.test")
  end

  test "membership lists and browser permission payloads are workspace scoped" do
    login(@owner)
    get "/api/workspace_memberships"
    assert_response :success
    assert_equal [@owner.id, @member.id].sort, response.parsed_body.map { |item| item.fetch("user_id") }.sort
    get "/api/session"
    assert_response :success
    assert_includes response.parsed_body.dig("user", "permissions"), "memberships.manage"
    assert_equal "active", response.parsed_body.dig("user", "workspace_membership", "status")
    patch "/api/workspace_memberships/#{@outsider.membership_for.id}", params: { workspace_membership: { role_names: ["owner"] } }
    assert_response :not_found
  end

  test "owners manage roles while members and admins cannot escalate them" do
    [@member, create_admin].each do |actor|
      login(actor)
      patch "/api/workspace_memberships/#{@member.membership_for.id}", params: { workspace_membership: { role_names: ["owner"] } }
      assert_response :forbidden
    end
    login(@owner)
    patch "/api/workspace_memberships/#{@member.membership_for.id}", params: { workspace_membership: { role_names: ["admin"] } }
    assert_response :success
    assert @member.reload.admin?
    assert_not @member.owner?
    patch "/api/users/#{@member.id}", params: { user: { first_name: "Changed", role_names: ["site_admin"] } }
    assert_response :unprocessable_entity
    assert_equal "PDF", @member.reload.first_name
    assert @member.admin?
  end

  test "last owner protection is atomic across both membership and existing people APIs" do
    login(@owner)
    patch "/api/workspace_memberships/#{@owner.membership_for.id}", params: { workspace_membership: { status: "suspended" } }
    assert_response :unprocessable_entity
    patch "/api/users/#{@owner.id}", params: { user: { first_name: "Changed", role_names: ["member"] } }
    assert_response :unprocessable_entity
    assert_equal "PDF", @owner.reload.first_name
    delete "/api/users/#{@owner.id}"
    assert_response :unprocessable_entity
    assert @owner.reload.owner?
    assert @owner.membership_for.active?
  end

  test "suspension denies browser mobile refresh and MCP access and never revives old sessions" do
    mobile, refresh = MobileSession.issue_for!(user: @member)
    token = MobileAccessToken.issue(mobile).fetch(:token)
    _, mcp_token = McpAccessToken.issue!(user: @member, name: "Member MCP")
    login(@member)
    member_web = WebSession.where(user_id: @member.id).last
    login(@owner)
    patch "/api/users/#{@member.id}", params: { user: { membership_status: "suspended" } }
    assert_response :success
    assert_equal "suspended", response.parsed_body.dig("workspace_membership", "status")
    assert mobile.reload.revoked_at
    assert member_web.reload.revoked_at
    assert_nil McpAccessToken.authenticate(mcp_token)
    post "/api/login", params: { auth: { email: @member.email, password: "Password!42" } }
    complete_test_mfa
    assert_response :forbidden
    get "/api/v1/me", headers: { "Authorization" => "Bearer #{token}" }
    assert_response :unauthorized
    post "/api/v1/auth/refresh", params: { refresh_token: refresh }
    assert_response :unauthorized
    post "/api/v1/auth/login", params: { auth: { email: @member.email, password: "Password!42" } }
    complete_test_mfa native: true
    assert_response :forbidden
    login(@owner)
    patch "/api/workspace_memberships/#{@member.membership_for.id}", params: { workspace_membership: { status: "active" } }
    assert_response :success
    assert @member.reload.workspace_access?
    get "/api/v1/me", headers: { "Authorization" => "Bearer #{token}" }
    assert_response :unauthorized
    assert_nil McpAccessToken.authenticate(mcp_token)
    login(@member)
    get "/api/session"
    assert_response :success
  end

  test "mobile membership API applies the same role policy and scope" do
    login_mobile(@owner)
    get "/api/v1/workspace_memberships", headers: @mobile_headers
    assert_response :success
    assert_equal 2, response.parsed_body.fetch("data").size
    patch "/api/v1/workspace_memberships/#{@member.membership_for.id}", params: { workspace_membership: { role_names: ["project_manager"] } }, headers: @mobile_headers
    assert_response :success
    assert @member.reload.project_manager?
    get "/api/v1/me", headers: @mobile_headers
    assert_includes response.parsed_body.dig("data", "permissions"), "memberships.manage"
    assert_equal @owner.membership_for.id, response.parsed_body.dig("data", "workspace_membership", "id")
  end

  test "generic admin edits cannot lock the last owner or bypass membership management" do
    login(@owner)
    patch "/api/admin/User/#{@owner.id}", params: { record: { status: "locked" } }
    assert_response :unprocessable_entity
    assert_not @owner.reload.locked?
    patch "/api/admin/WorkspaceMembership/#{@member.membership_for.id}", params: { record: { status: "suspended" } }
    assert_response :unprocessable_entity
    assert @member.membership_for.active?
  end

  test "another active owner permits demotion without granting platform administration" do
    login(@owner)
    patch "/api/workspace_memberships/#{@member.membership_for.id}", params: { workspace_membership: { role_names: ["owner"] } }
    assert_response :success
    assert @member.reload.owner?
    assert_not @member.site_admin?
    patch "/api/users/#{@owner.id}", params: { user: { role_names: ["member"] } }
    assert_response :success
    assert_not @owner.reload.owner?
    assert_includes response.parsed_body.fetch("permissions"), "memberships.read"
    assert_not_includes response.parsed_body.fetch("permissions"), "memberships.manage"
    get "/api/session"
    assert_response :success
    assert_not_includes response.parsed_body.dig("user", "permissions"), "memberships.manage"
  end

  private

  def login(user)
    post "/api/login", params: { auth: { email: user.email, password: "Password!42" } }
    complete_test_mfa
    assert_response :success
  end

  def login_mobile(user)
    post "/api/v1/auth/login", params: { auth: { email: user.email, password: "Password!42" } }
    complete_test_mfa native: true
    assert_response :success
    @mobile_headers = { "Authorization" => "Bearer #{response.parsed_body.dig('data', 'access_token')}" }
  end

  def create_admin
    admin = create_test_user(workspace: @workspace, email: "membership-admin@example.test")
    Current.set(workspace: @workspace) { admin.roles = [Role.find_by!(name: "admin")] }
    admin
  end
end
