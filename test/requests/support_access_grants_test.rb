require "test_helper"

class SupportAccessGrantsTest < ActionDispatch::IntegrationTest
  setup do
    @company = Workspace.create!(name: "Support customer", slug: "support-customer", kind: "private")
    @platform = Workspace.create!(name: "Support staff", slug: "support-staff", kind: "private")
    @owner = create_test_user(workspace: @company, email: "support-customer-owner@example.test")
    @support = create_test_user(workspace: @platform, email: "support-staff-admin@example.test")
    @support.update!(site_admin: true)
    Current.set(workspace: @company) { @owner.roles = [Role.find_by!(name: "owner")] }
    @project = Project.create!(workspace: @company, owner: @owner, name: "Customer scoped project")
    Project.create!(workspace: @platform, owner: @support, name: "Staff secret project")
    login_and_mfa(@support)
    login_and_mfa(@owner)
  end

  test "only owner-approved resources are inspected with attribution and immediate revocation" do
    grant = approve
    login_and_mfa(@support)
    get "/api/support_access_grants/#{grant.id}/inspect_records", params: { resource: "projects" }
    assert_response :success
    assert_equal [@project.id], response.parsed_body["records"].map { |row| row["id"] }
    assert_not_includes response.body, "owner_id"
    assert_not_includes response.body, "Staff secret"
    event = WorkspaceAccessEvent.in_workspace(@company).where(action: "support.inspected").last
    assert_equal @support.id, event.details["actor_user_id"]
    assert_equal grant.id, event.details["grant_id"]
    get "/api/support_access_grants/#{grant.id}/inspect_records", params: { resource: "users" }
    assert_response :forbidden
    login_and_mfa(@owner)
    post "/api/support_access_grants/#{grant.id}/revoke"
    assert_response :success
    login_and_mfa(@support)
    get "/api/support_access_grants/#{grant.id}/inspect_records", params: { resource: "projects" }
    assert_response :forbidden
  end

  test "expiry missing MFA and the wrong support identity fail closed" do
    grant = approve
    login_and_mfa(@support)
    travel 31.minutes do
      post "/api/refresh"
      assert_response :success
      get "/api/support_access_grants/#{grant.id}/inspect_records", params: { resource: "projects" }
      assert_response :forbidden
    end
    other = create_test_user(workspace: @platform, email: "support-other-admin@example.test")
    other.update!(site_admin: true)
    login_and_mfa(other)
    get "/api/support_access_grants/#{grant.id}/inspect_records", params: { resource: "projects" }
    assert_response :not_found
  end

  test "support grants cannot outlive the approver's owner authority" do
    grant = approve
    Current.set(workspace: @company) { @owner.roles = [Role.find_by!(name: "member")] }
    login_and_mfa(@support)
    get "/api/support_access_grants/#{grant.id}/inspect_records", params: { resource: "projects" }
    assert_response :forbidden
    assert_not grant.reload.usable?
  end

  test "approval rejects non-support accounts excessive lifetimes and unapproved resources" do
    [{duration_minutes:61}, {resources:['users']}, {support_email:@owner.email}].each do |overrides|
      post "/api/support_access_grants", params: { support_access_grant: attributes.merge(overrides) }
      assert_response :unprocessable_entity
    end
  end

  private
  def attributes
    {support_email:@support.email,reason:"Investigate ticket NX-100",duration_minutes:30,resources:['projects']}
  end
  def approve
    post "/api/support_access_grants", params: { support_access_grant: attributes }
    assert_response :created
    SupportAccessGrant.find(response.parsed_body["id"])
  end
  def login_and_mfa(user)
    delete "/api/logout"
    post "/api/login", params: { auth: { email: user.email, password: "Password!42" } }
    assert_response :success
    unless user.reload.mfa_enabled_at
      post "/api/mfa/setup"
      secret = response.parsed_body["secret"]
      post "/api/mfa/confirm", params: { otp_code: ROTP::TOTP.new(secret).now }
    else
      # Advance to the next TOTP step to respect replay prevention across logins.
      travel 31.seconds
      post "/api/mfa/verify", params: { otp_code: ROTP::TOTP.new(PrivilegedMfa.secret(user)).now }
    end
    assert_response :success
  end
end
