require "test_helper"

class PrivilegedMfaTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "MFA Company", slug: "mfa-company", kind: "private", plan_key: "enterprise")
    @owner = create_test_user(workspace: @workspace, email: "mfa-owner@example.test")
    Current.set(workspace: @workspace) { @owner.roles = [Role.find_by!(name: "owner")] }
    login
  end

  test "password login is restricted until enrollment and setup never leaks through directory or admin" do
    assert response.parsed_body.dig("user", "mfa", "required")
    get "/api/users"
    assert_response :forbidden
    assert_equal "mfa_required", response.parsed_body["error"]
    old = WebSession.issue_for!(@owner)
    codes = enroll
    assert_equal 10, codes.size
    assert codes.all? { |value| value.size == 20 }
    assert old.reload.revoked_at
    assert_not_equal @secret, @owner.reload.mfa_secret_ciphertext
    assert_equal PrivilegedMfa.digest(codes.first), @owner.mfa_recovery_digests.first
    get "/api/users"
    assert_response :success
    assert_not_includes response.body, @secret
    assert_not_includes response.body, "mfa_secret_ciphertext"
    assert_not_includes response.body, "mfa_recovery_digests"
    delete "/api/mfa", params: { password: "Password!42" }
    assert_response :unprocessable_entity
    assert @owner.reload.mfa_enabled_at
  end

  test "authenticator replay and account attempts are enforced and recovery works only once" do
    codes = enroll
    post "/api/mfa/verify", params: { otp_code: ROTP::TOTP.new(@secret).now }
    assert_response :unprocessable_entity
    4.times { post "/api/mfa/verify", params: { otp_code: "bad" }; assert_response :unprocessable_entity }
    assert @owner.reload.mfa_locked_until.future?
    post "/api/mfa/verify", params: { otp_code: codes.first }
    assert_response :unprocessable_entity
    travel 16.minutes do
      post "/api/refresh"
      assert_response :success
      post "/api/mfa/verify", params: { otp_code: codes.first }
      assert_response :success
      post "/api/mfa/verify", params: { otp_code: codes.first }
      assert_response :unprocessable_entity
      assert_equal 9, @owner.reload.mfa_recovery_digests.size
    end
  end

  test "expired setup and bad confirmation commit attempts without enabling MFA" do
    post "/api/mfa/setup"
    assert_response :success
    post "/api/mfa/confirm", params: { otp_code: "bad" }
    assert_response :unprocessable_entity
    assert_equal 1, @owner.reload.mfa_failed_attempts
    travel 11.minutes do
      post "/api/mfa/confirm", params: { otp_code: "123456" }
      assert_response :unprocessable_entity
      assert_nil @owner.reload.mfa_enabled_at
    end
  end

  test "privileged mutations require a recent second factor and refresh cannot renew it" do
    enroll
    travel 11.minutes do
      post "/api/refresh"
      assert_response :success
      assert_not response.parsed_body.dig("user", "mfa", "recent")
      post "/api/workspace_invitations", params: { workspace_invitation: { email: "fresh@example.test" } }
      assert_response :forbidden
      assert_equal "mfa_step_up_required", response.parsed_body["error"]
      post "/api/mfa/verify", params: { otp_code: ROTP::TOTP.new(@secret).now }
      assert_response :success
      post "/api/workspace_invitations", params: { workspace_invitation: { email: "fresh@example.test" } }
      assert_response :created
    end
  end

  test "native password login and MFA cannot fall back to cookies" do
    post "/api/v1/auth/login", params: { auth: { email: @owner.email, password: "Password!42" } }
    assert_response :success
    access = response.parsed_body.dig("data", "access_token")
    headers = { "Authorization" => "Bearer #{access}", "Origin" => "null" }
    get "/api/v1/users", headers: headers
    assert_response :forbidden
    post "/api/v1/mfa/setup", headers: headers
    assert_response :success
    secret = response.parsed_body.dig("data", "secret")
    post "/api/v1/mfa/confirm", params: { otp_code: ROTP::TOTP.new(secret).now }, headers: headers
    assert_response :success
    get "/api/v1/users", headers: headers
    assert_response :success
    get "/api/v1/mfa", headers: { "Authorization" => "Bearer invalid" }
    assert_response :unauthorized
  end

  test "optional MFA disable cannot revive previously revoked integration credentials" do
    employee = create_test_user(workspace: @workspace, email: "optional-mfa@example.test")
    _, raw = McpAccessToken.issue!(user: employee, name: "before-mfa")
    assert McpAccessToken.authenticate(raw)
    post "/api/login", params: { auth: { email: employee.email, password: "Password!42" } }
    codes = enroll
    assert_nil McpAccessToken.authenticate(raw)
    delete "/api/mfa", params: { password: "Password!42" }
    assert_response :success
    assert_nil employee.reload.mfa_enabled_at
    assert_nil McpAccessToken.authenticate(raw)
    assert_equal 10, codes.size
  end

  test "legacy impersonation is unavailable after MFA" do
    enroll
    employee = create_test_user(workspace: @workspace, email: "mfa-employee@example.test")
    post "/api/admin/impersonate", params: { user_id: employee.id }
    assert_response :gone
  end

  private
  def login
    post "/api/login", params: { auth: { email: @owner.email, password: "Password!42" } }
    assert_response :success
  end
  def enroll
    post "/api/mfa/setup"
    assert_response :success
    @secret = response.parsed_body["secret"]
    post "/api/mfa/confirm", params: { otp_code: ROTP::TOTP.new(@secret).now }
    assert_response :success
    response.parsed_body["recovery_codes"]
  end
end
