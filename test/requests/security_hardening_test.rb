require "test_helper"

class SecurityHardeningTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Security", slug: "security-hardening", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "security@example.test")
  end

  test "anonymous users cannot read the user directory" do
    get "/api/users"
    assert_response :unauthorized
  end

  test "logout revokes copied access and refresh cookies" do
    login
    stolen = cookies.to_hash.slice("access_token", "refresh_token")
    delete "/api/logout"
    assert_response :success
    stolen.each { |key, value| cookies[key] = value }
    get "/api/session"
    assert_response :unauthorized
    post "/api/refresh"
    assert_response :unauthorized
  end

  test "logout works after access expiry and still revokes refresh" do
    login
    token = cookies[:refresh_token]
    travel 16.minutes do
      delete "/api/logout"
      assert_response :success
      cookies[:refresh_token] = token
      post "/api/refresh"
      assert_response :unauthorized
    end
  end

  test "locked accounts cannot use either browser token" do
    login
    @user.update!(status: "locked")
    get "/api/session"
    assert_response :unauthorized
    post "/api/refresh"
    assert_response :unauthorized
  end

  test "password change invalidates old cookies while keeping the changing browser signed in" do
    login
    stolen = cookies.to_hash.slice("access_token", "refresh_token")
    patch "/api/password/change", params: { password: {
      current_password: "Password!42", password: "NewPassword!42", password_confirmation: "NewPassword!42"
    } }
    assert_response :success
    get "/api/session"
    assert_response :success
    stolen.each { |key, value| cookies[key] = value }
    get "/api/session"
    assert_response :unauthorized
    post "/api/refresh"
    assert_response :unauthorized
  end

  test "profile endpoint does not bypass current password verification" do
    login
    post "/api/update_profile", params: { auth: { password: "HijackedPassword!42", first_name: "Changed" } }
    assert_response :success
    assert @user.reload.valid_password?("Password!42")
  end

  test "user directory response omits authentication and integration secrets" do
    login
    get "/api/users/#{@user.id}"
    assert_response :success
    User::PUBLIC_JSON_EXCLUDED_ATTRIBUTES.each { |key| assert_not response.parsed_body.key?(key.to_s), key.to_s }
  end

  test "cookie writes require CSRF but valid same origin browser requests work" do
    login
    previous = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    get "/users"
    csrf = Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"]
    post "/api/users/presence"
    assert_response :unprocessable_entity
    post "/api/users/presence", headers: { "X-CSRF-Token" => csrf }
    assert_response :success
    post "/api/users/presence", headers: { "X-CSRF-Token" => csrf, "Origin" => "https://evil.example" }
    assert_response :unprocessable_entity
  ensure
    ActionController::Base.allow_forgery_protection = previous
  end

  test "API bearer clients keep working with CSRF enabled" do
    session, = MobileSession.issue_for!(user: @user)
    token = JwtService.encode({ user_id: @user.id, mobile_session_id: session.id, type: "mobile_access" })
    previous = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    post "/api/users/presence", headers: { "Authorization" => "Bearer #{token}", "Origin" => "null" }
    assert_response :success
  ensure
    ActionController::Base.allow_forgery_protection = previous
  end

  test "login and logout rotate CSRF tokens without breaking the next browser login" do
    previous = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    get "/login"
    csrf = Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"]
    post "/api/login", params: { auth: { email: @user.email, password: "Password!42" } }, headers: { "X-CSRF-Token" => csrf }
    assert_response :success
    csrf = response.headers.fetch("X-CSRF-Token")
    delete "/api/logout", headers: { "X-CSRF-Token" => csrf }
    assert_response :success
    csrf = response.headers.fetch("X-CSRF-Token")
    post "/api/login", params: { auth: { email: @user.email, password: "Password!42" } }, headers: { "X-CSRF-Token" => csrf }
    assert_response :success
  ensure
    ActionController::Base.allow_forgery_protection = previous
  end

  test "application shell is not indexed and security headers allow first party calls" do
    get "/users"
    assert_response :success
    assert_equal "noindex, nofollow", response.headers["X-Robots-Tag"]
    assert_select 'meta[name="robots"][content="noindex, nofollow"]'
    assert_select "html[lang=en]"
    assert_includes response.headers["Content-Security-Policy"], "object-src 'none'"
    assert_includes response.headers["Permissions-Policy"], "camera=(self)"
  end

  private

  def login
    post "/api/login", params: { auth: { email: @user.email, password: "Password!42" } }
    assert_response :success
  end
end
