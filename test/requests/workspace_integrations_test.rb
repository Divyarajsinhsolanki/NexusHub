require "test_helper"

class WorkspaceIntegrationsTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Integration owner", slug: "integration-owner", kind: "private")
    @owner = create_test_user(workspace: @workspace, email: "integration-owner@example.test")
    Current.set(workspace: @workspace) { @owner.roles << Role.find_by!(name: "owner") }
    login(@owner)
  end

  test "owners configure write-only connections and can revoke through native aliases" do
    webhook = "https://hooks.slack.com/services/T1/B2/private-value"
    put "/api/workspace_integrations/slack", params: { integration: { credential: webhook }, workspace_id: 999 }, as: :json
    assert_response :success, response.body
    refute_includes response.body, "private-value"
    record = WorkspaceIntegration.in_workspace(@workspace).find_by!(provider: "slack")
    assert_equal webhook, record.secret
    get "/api/workspace_integrations"
    assert_response :success
    refute_includes response.body, "ciphertext"
    assert_equal 1, WorkspaceAccessEvent.in_workspace(@workspace).where(action: "integration.updated").count
    delete "/api/workspace_integrations/slack"
    assert_response :no_content
    assert_nil record.reload.secret_ciphertext
  end

  test "members cannot read metadata or mutate workspace integration credentials" do
    member = create_test_user(workspace: @workspace, email: "integration-member@example.test")
    login(member)
    get "/api/workspace_integrations"
    assert_response :forbidden
    put "/api/workspace_integrations/slack", params: { integration: { credential: "https://hooks.slack.com/services/T/B/S" } }, as: :json
    assert_response :forbidden
  end

  test "another workspace owner sees only their own connections even with a forged workspace parameter" do
    put "/api/workspace_integrations/slack", params: { integration: { credential: "https://hooks.slack.com/services/T/B/original" } }, as: :json
    assert_response :success
    outside = Workspace.create!(name: "Other integration", slug: "other-integration", kind: "private")
    other = create_test_user(workspace: outside, email: "outside-integration@example.test")
    Current.set(workspace: outside) { other.roles << Role.find_by!(name: "owner") }
    login(other)
    get "/api/workspace_integrations", params: { workspace_id: @workspace.id }
    assert_response :success
    assert response.parsed_body.none? { |connection| connection["configured"] }
    delete "/api/workspace_integrations/slack", params: { workspace_id: @workspace.id }
    assert_response :not_found
  end

  test "sensitive writes require recent MFA while metadata reads remain available" do
    travel 11.minutes do
      put "/api/workspace_integrations/slack", params: { integration: { credential: "https://hooks.slack.com/services/T/B/S" } }, as: :json
      assert_response :forbidden
      assert_equal "mfa_step_up_required", response.parsed_body["error"]
      get "/api/workspace_integrations"
      assert_response :success
    end
  end

  test "native connections require bearer MFA and return only metadata" do
    session, = MobileSession.issue_for!(user: @owner)
    token = JwtService.encode({ user_id: @owner.id, mobile_session_id: session.id, type: "mobile_access" })
    headers = { "Authorization" => "Bearer #{token}" }
    get "/api/v1/workspace_integrations", headers: headers
    assert_response :forbidden
    enroll_test_mfa(@owner, headers:, native: true)
    put "/api/v1/workspace_integrations/slack", params: { integration: { credential: "https://hooks.slack.com/services/T/B/native-private" } }, headers:, as: :json
    assert_response :success, response.body
    assert_equal true, response.parsed_body.dig("data", "configured")
    refute_includes response.body, "native-private"
    delete "/api/v1/workspace_integrations/slack", headers: headers
    assert_response :success
  end

  private

  def login(user)
    post "/api/login", params: { auth: { email: user.email, password: "Password!42" } }, as: :json
    complete_test_mfa
    assert_response :success
  end
end
