require "test_helper"

class ApplicationCable::ConnectionTest < ActionCable::Connection::TestCase
  tests ApplicationCable::Connection

  setup do
    workspace = Workspace.create!(name: "Cable Sessions", slug: "cable-sessions", kind: "private")
    @user = create_test_user(workspace: workspace, email: "cable-session@example.test")
    @session, = MobileSession.issue_for!(user: @user)
  end

  test "privileged realtime connections require a verified MFA session" do
    Current.set(workspace: @user.workspace) { @user.roles = [Role.find_by!(name: "owner")] }
    assert_reject_connection { connect params: { token: cable_token } }
    @user.update!(mfa_enabled_at: Time.current)
    @session.update!(mfa_verified_at: Time.current)
    connect params: { token: cable_token }
    assert connection.session_valid?
    @session.update!(mfa_verified_at: nil)
    assert_not connection.session_valid?
  end

  test "mobile connections are identified by the authenticated device" do
    connect params: { token: cable_token }
    assert_equal @user, connection.current_user
    assert_equal "mobile:#{@session.id}", connection.session_key
  end

  test "revoked mobile sessions and sessionless tokens are rejected" do
    @session.revoke!
    assert_reject_connection { connect params: { token: cable_token } }
    token = JwtService.encode({ user_id: @user.id, type: "cable_access" })
    assert_reject_connection { connect params: { token: token } }
  end

  test "browser connections require a valid server session" do
    web_session = WebSession.issue_for!(@user)
    cookies.signed[:access_token] = web_session.token(type: "web_access", expires_at: 15.minutes.from_now)
    connect
    assert_equal "web:#{web_session.id}", connection.session_key
  end

  test "an invalid explicit token cannot fall back to a valid browser cookie" do
    web_session = WebSession.issue_for!(@user)
    cookies.signed[:access_token] = web_session.token(type: "web_access", expires_at: 15.minutes.from_now)
    assert_reject_connection { connect params: { token: "invalid" } }
  end

  test "connected sessions are revalidated after revocation and expiry" do
    connect params: { token: cable_token }
    assert connection.session_valid?
    @session.revoke!
    assert_not connection.session_valid?
    connection.define_singleton_method(:close) { |**options| @close_options = options }
    performed = false
    connection.run_callbacks(:command) { performed = true }
    assert_not performed
    assert_equal false, connection.instance_variable_get(:@close_options)[:reconnect]
  end

  test "a socket cannot outlive its session expiry" do
    connect params: { token: cable_token }
    travel_to(@session.expires_at + 1.second) { assert_not connection.session_valid? }
  end

  private

  def cable_token
    JwtService.encode({ user_id: @user.id, mobile_session_id: @session.id, type: "cable_access" })
  end
end

class ApplicationCable::ConnectionTest
  test "membership suspension rejects new sockets and invalidates connected commands" do
    connect params: { token: cable_token }
    assert connection.session_valid?
    @user.membership_for.update!(status: "suspended")
    assert_not connection.session_valid?
    assert_reject_connection { connect params: { token: cable_token } }
  end
end
