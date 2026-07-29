require "test_helper"

class AuthFlowsTest < ActionDispatch::IntegrationTest
  PASSWORD = "Password!42"

  setup do
    @workspace = Workspace.create!(name: "Auth Workspace", slug: "auth-workspace", kind: "private")
    @user = @workspace.users.create!(
      email: "auth-user@example.test",
      password: PASSWORD,
      password_confirmation: PASSWORD,
      first_name: "Auth",
      last_name: "User",
      job_title: "Engineer",
      status: "active",
      confirmed_at: Time.current
    )
  end

  test "session endpoint hydrates authenticated browser tabs from auth cookies" do
    login

    get "/api/session"

    assert_response :success
    assert_equal @user.email, response.parsed_body.dig("user", "email")
    assert response.parsed_body.fetch("exp").present?
  end

  test "authenticated user can change password with current password" do
    login

    patch "/api/password/change", params: {
      password: {
        current_password: "wrong-password",
        password: "NewPassword!42",
        password_confirmation: "NewPassword!42"
      }
    }

    assert_response :unprocessable_entity
    assert @user.reload.valid_password?(PASSWORD)

    patch "/api/password/change", params: {
      password: {
        current_password: PASSWORD,
        password: "NewPassword!42",
        password_confirmation: "NewPassword!42"
      }
    }

    assert_response :success
    assert @user.reload.valid_password?("NewPassword!42")
  end

  test "google login uses verified firebase token payload" do
    provider_payload = {
      email: "web-google@example.test",
      name: "Web Google",
      given_name: "Web",
      family_name: "Google"
    }.with_indifferent_access

    with_firebase_payload(provider_payload) do
      post "/api/login", params: { id_token: "verified-token" }
    end

    assert_response :success
    assert_equal "web-google@example.test", response.parsed_body.dig("user", "email")
    assert User.find_by!(email: "web-google@example.test").confirmed?
  end

  test "forgot password returns accepted even when mail delivery raises" do
    with_reset_mail_failure do
      post "/api/password/forgot", params: { password: { email: @user.email } }
    end

    assert_response :success
    assert_equal "If that email exists, a reset link is on its way.", response.parsed_body.fetch("message")
  end

  private

  def login
    post "/api/login", params: { auth: { email: @user.email, password: PASSWORD } }
    assert_response :success
  end

  def with_reset_mail_failure
    original = User.instance_method(:send_reset_password_instructions)
    User.define_method(:send_reset_password_instructions) { raise "SMTP unavailable" }
    yield
  ensure
    User.define_method(:send_reset_password_instructions, original)
  end

  def with_firebase_payload(payload)
    original = FirebaseIdTokenVerifier.method(:call)
    FirebaseIdTokenVerifier.singleton_class.define_method(:call) { |_token| payload }
    yield
  ensure
    FirebaseIdTokenVerifier.singleton_class.define_method(:call) { |token| original.call(token) }
  end
end
