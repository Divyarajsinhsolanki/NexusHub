require "test_helper"

class SessionRevocationTest < ActionDispatch::IntegrationTest
  include ActionCable::TestHelper
  setup do
    workspace = Workspace.create!(name: "Sessions", slug: "session-revocation", kind: "private")
    @user = create_test_user(workspace: workspace, email: "sessions@example.test")
    @web = WebSession.issue_for!(@user)
    @mobile, @refresh = MobileSession.issue_for!(user: @user)
  end

  test "password resets revoke both web and mobile sessions" do
    @user.update!(password: "NewPassword!42", password_confirmation: "NewPassword!42")
    assert @web.reload.revoked_at
    assert @mobile.reload.revoked_at
    get "/api/v1/me", headers: { "Authorization" => "Bearer #{MobileAccessToken.issue(@mobile)[:token]}" }
    assert_response :unauthorized
    post "/api/v1/auth/refresh", params: { refresh_token: @refresh }
    assert_response :unauthorized
  end

  test "lock and unlock never restore previously signed in devices" do
    @user.update!(status: "locked")
    @user.update!(status: "active")
    assert @web.reload.revoked_at
    assert @mobile.reload.revoked_at
  end

  test "changing a mobile password keeps only the requesting device usable" do
    other, = MobileSession.issue_for!(user: @user)
    token = MobileAccessToken.issue(@mobile)[:token]
    patch "/api/v1/auth/password/change", params: { password: {
      current_password: "Password!42", password: "NewPassword!42", password_confirmation: "NewPassword!42"
    } }, headers: { "Authorization" => "Bearer #{token}" }
    assert_response :success
    assert @web.reload.revoked_at
    assert other.reload.revoked_at
    assert_nil @mobile.reload.revoked_at
    get "/api/v1/me", headers: { "Authorization" => "Bearer #{token}" }
    assert_response :success
  end

  test "logout revokes the access session even when its refresh token was rotated" do
    token = MobileAccessToken.issue(@mobile)[:token]
    @mobile.rotate!(@refresh)
    delete "/api/v1/auth/logout", params: { refresh_token: @refresh }, headers: { "Authorization" => "Bearer #{token}" }
    assert_response :success
    assert @mobile.reload.revoked_at
  end

  test "unbound mobile tokens are rejected" do
    token = JwtService.encode({ user_id: @user.id, type: "mobile_access" })
    get "/api/v1/me", headers: { "Authorization" => "Bearer #{token}" }
    assert_response :unauthorized
  end

  test "revoking one device publishes a targeted disconnect without reconnect" do
    remote = ActionCable.server.remote_connections.where(current_user: @user, current_workspace: @user.workspace, session_key: "mobile:#{@mobile.id}")
    stream = remote.send(:internal_channel)
    assert_broadcast_on(stream, { type: "disconnect", reconnect: false }) { @mobile.revoke! }
    assert_nil @web.reload.revoked_at
  end
end
