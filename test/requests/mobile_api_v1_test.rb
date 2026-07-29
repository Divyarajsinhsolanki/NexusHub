require "test_helper"

class MobileApiV1Test < ActionDispatch::IntegrationTest
  PASSWORD = "Password!42"

  setup do
    @workspace = Workspace.create!(name: "Mobile Workspace", slug: "mobile-workspace", kind: "private")
    @user = create_user(@workspace, "mobile@example.com", "Mobile")
    @other_workspace = Workspace.create!(name: "Other Workspace", slug: "other-workspace", kind: "private")
    @other_user = create_user(@other_workspace, "other@example.com", "Other")

    Current.user = @user
    Current.workspace = @workspace
    @project = Project.create!(name: "Apollo", owner: @user)
    @second_project = Project.create!(name: "Beacon", owner: @user)
    @sprint = Sprint.create!(project: @project, name: "Sprint 1", start_date: Date.current, end_date: 2.weeks.from_now.to_date)
    @task = Task.create!(
      project: @project,
      sprint: @sprint,
      developer: @user,
      task_id: "APP-1",
      title: "Build mobile API",
      type: "Code",
      status: "todo",
      end_date: Date.current
    )
    @category = WorkCategory.create!(name: "Development", hex: "#2563eb")
    @priority = WorkPriority.create!(name: "High", hex: "#dc2626")
    Notification.create!(recipient: @user, actor: @user, action: "assigned", notifiable: @task)

    Current.user = @other_user
    Current.workspace = @other_workspace
    Project.create!(name: "Private Other Project", owner: @other_user)
    Current.reset_all
  end

  test "login returns bearer and rotating refresh tokens without setting browser cookies" do
    payload = mobile_login

    assert payload.fetch("access_token").present?
    assert payload.fetch("refresh_token").present?
    assert_equal @user.id, payload.dig("user", "id")
    assert_equal 1, MobileSession.where(user: @user).count
    assert_nil cookies[:access_token]

    get "/api/v1/me", headers: bearer_headers(payload.fetch("access_token"))

    assert_response :success
    assert_equal @user.email, response.parsed_body.dig("data", "email")
  end

  test "native requests with a null origin bypass browser forgery protection" do
    previous_setting = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true

    post "/api/v1/auth/login",
      params: { auth: { email: @user.email, password: PASSWORD, device_name: "Android app" } },
      headers: { "Origin" => "null", "Accept" => "application/json" }

    assert_response :success
    assert response.parsed_body.dig("data", "access_token").present?
  ensure
    ActionController::Base.allow_forgery_protection = previous_setting
  end

  test "refresh rotates its token and rejects replay" do
    original = mobile_login.fetch("refresh_token")

    post "/api/v1/auth/refresh", params: { refresh_token: original }
    assert_response :success
    rotated = response.parsed_body.dig("data", "refresh_token")
    refute_equal original, rotated

    post "/api/v1/auth/refresh", params: { refresh_token: original }
    assert_response :unauthorized
    assert_equal "invalid_refresh_token", response.parsed_body.dig("error", "code")

    post "/api/v1/auth/refresh", params: { refresh_token: rotated }
    assert_response :success
  end

  test "logout revokes the mobile session" do
    refresh_token = mobile_login.fetch("refresh_token")

    delete "/api/v1/auth/logout", params: { refresh_token: refresh_token }
    assert_response :success
    assert MobileSession.find_by_token(refresh_token)&.revoked_at?

    post "/api/v1/auth/refresh", params: { refresh_token: refresh_token }
    assert_response :unauthorized
  end

  test "authentication and resource errors use the normalized shape" do
    get "/api/v1/me"
    assert_response :unauthorized
    assert_equal "unauthorized", response.parsed_body.dig("error", "code")

    token = mobile_login.fetch("access_token")
    patch "/api/v1/tasks/#{@task.id}", params: { task: { status: "unknown" } }, headers: bearer_headers(token)
    assert_response :unprocessable_entity
    assert_equal "invalid_status", response.parsed_body.dig("error", "code")

    get "/api/v1/projects/999999", headers: bearer_headers(token)
    assert_response :not_found
    assert_equal "not_found", response.parsed_body.dig("error", "code")
  end

  test "locked users cannot continue with an existing mobile access token" do
    token = mobile_login.fetch("access_token")
    @user.update!(status: "locked")

    get "/api/v1/me", headers: bearer_headers(token)

    assert_response :unauthorized
    assert_equal "unauthorized", response.parsed_body.dig("error", "code")
  end

  test "projects paginate and remain isolated to the authenticated workspace" do
    token = mobile_login.fetch("access_token")

    get "/api/v1/projects", params: { page: 1, per_page: 1 }, headers: bearer_headers(token)

    assert_response :success
    body = response.parsed_body
    assert_equal 1, body.fetch("data").size
    assert_equal 2, body.dig("meta", "total_count")
    refute_includes body.fetch("data").map { |project| project.fetch("name") }, "Private Other Project"
  end

  test "tasks support mine filtering and status updates" do
    token = mobile_login.fetch("access_token")

    get "/api/v1/tasks", params: { mine: true }, headers: bearer_headers(token)
    assert_response :success
    assert_equal [@task.id], response.parsed_body.fetch("data").map { |task| task.fetch("id") }

    patch "/api/v1/tasks/#{@task.id}", params: { task: { status: "inprogress", task_url: "https://example.test/tasks/APP-1", story_point: 5, dev_hours: 3.5, blocker: true } }, headers: bearer_headers(token)
    assert_response :success
    assert_equal "inprogress", response.parsed_body.dig("data", "status")
    assert_equal "https://example.test/tasks/APP-1", response.parsed_body.dig("data", "task_url")
    assert_equal 5, response.parsed_body.dig("data", "story_point").to_i
    assert_equal true, response.parsed_body.dig("data", "blocker")
  end

  test "owners manage team membership and department assignments from mobile" do
    @user.roles = [Role.find_or_create_by!(name: "owner")]
    teammate = create_user(@workspace, "organization@example.com", "Organization")
    token = mobile_login.fetch("access_token")

    post "/api/v1/teams", params: { team: { name: "Mobile Platform", description: "Native delivery" } }, headers: bearer_headers(token)
    assert_response :created
    team_id = response.parsed_body.dig("data", "id")

    post "/api/v1/team_users", params: { team_user: { team_id: team_id, user_id: teammate.id, role: "member", status: "accepted" } }, headers: bearer_headers(token)
    assert_response :created

    get "/api/v1/teams/#{team_id}/insights", headers: bearer_headers(token)
    assert_response :success
    assert_equal [teammate.id], response.parsed_body.dig("data", "members").map { |member| member.fetch("id") }

    post "/api/v1/departments", params: { department: { name: "Engineering", manager_id: @user.id } }, headers: bearer_headers(token)
    assert_response :created
    department_id = response.parsed_body.dig("data", "id")

    patch "/api/v1/departments/#{department_id}/update_members", params: { user_ids: [teammate.id, @other_user.id] }, headers: bearer_headers(token)
    assert_response :success
    assert_equal [teammate.id], response.parsed_body.dig("data", "users").map { |member| member.fetch("id") }
    assert_equal @workspace.id, teammate.reload.workspace_id
    assert_nil @other_user.reload.department_id
  end

  test "project calendar events include reminders" do
    token = mobile_login.fetch("access_token")
    start_at = 1.day.from_now.change(sec: 0)

    post "/api/v1/calendar_events", params: { calendar_event: { title: "Sprint review", start_at: start_at, end_at: start_at + 1.hour, event_type: "sprint_ceremony", visibility: "project", status: "scheduled", project_id: @project.id } }, headers: bearer_headers(token)
    assert_response :created
    event_id = response.parsed_body.dig("data", "events", 0, "id")

    post "/api/v1/calendar_events/#{event_id}/event_reminders", params: { event_reminder: { channel: "in_app", minutes_before: 30 } }, headers: bearer_headers(token)
    assert_response :created

    get "/api/v1/calendar_events", headers: bearer_headers(token)
    assert_response :success
    event = response.parsed_body.fetch("data").find { |row| row.fetch("id") == event_id }
    assert_equal @project.id, event.fetch("project_id")
    assert_equal 30, event.fetch("event_reminders").first.fetch("minutes_before")
  end

  test "work logs can be created updated listed and deleted" do
    token = mobile_login.fetch("access_token")
    attributes = {
      title: "Mobile implementation",
      description: "Build the work-log screen",
      log_date: Date.current,
      start_time: "09:00",
      end_time: "10:30",
      actual_minutes: 90,
      category_id: @category.id,
      priority_id: @priority.id,
      tags: ["mobile", "api"]
    }

    post "/api/v1/work_logs", params: { work_log: attributes }, headers: bearer_headers(token)
    assert_response :created
    work_log_id = response.parsed_body.dig("data", "id")
    assert_equal ["api", "mobile"], response.parsed_body.dig("data", "tags").map { |tag| tag.fetch("name") }.sort

    patch "/api/v1/work_logs/#{work_log_id}", params: { work_log: attributes.merge(title: "Updated work") }, headers: bearer_headers(token)
    assert_response :success
    assert_equal "Updated work", response.parsed_body.dig("data", "title")

    get "/api/v1/work_logs", params: { date: Date.current }, headers: bearer_headers(token)
    assert_response :success
    assert_equal [work_log_id], response.parsed_body.fetch("data").map { |log| log.fetch("id") }

    delete "/api/v1/work_logs/#{work_log_id}", headers: bearer_headers(token)
    assert_response :success
    assert_not WorkLog.unscoped.exists?(work_log_id)
  end

  test "notifications include pagination counts and project deep links" do
    token = mobile_login.fetch("access_token")

    get "/api/v1/notifications", headers: bearer_headers(token)
    assert_response :success
    notification = response.parsed_body.fetch("data").first
    assert_equal "/projects/#{@project.id}?taskId=#{@task.id}", notification.fetch("deep_link")
    assert_equal 1, response.parsed_body.dig("meta", "unread_count")

    patch "/api/v1/notifications/#{notification.fetch('id')}/read", headers: bearer_headers(token)
    assert_response :success
    assert response.parsed_body.dig("data", "read_at").present?
  end

  test "signup and Google login join the regular workspace as members" do
    post "/api/v1/auth/signup", params: {
      auth: {
        first_name: "New",
        last_name: "Owner",
        email: "new-owner@example.com",
        password: PASSWORD,
        password_confirmation: PASSWORD
      }
    }
    assert_response :created
    signed_up = User.find_by!(email: "new-owner@example.com")
    assert_includes signed_up.role_names, "member"
    assert_not_includes signed_up.role_names, "owner"
    assert_equal Workspace.regular!, signed_up.workspace
    assert_equal signed_up.workspace_id, response.parsed_body.dig("data", "user", "workspace", "id")
    workspace_count = Workspace.count

    provider_payload = {
      email: "google-owner@example.com",
      name: "Google Owner",
      given_name: "Google",
      family_name: "Owner"
    }
    original_verifier = FirebaseIdTokenVerifier.method(:call)
    FirebaseIdTokenVerifier.singleton_class.define_method(:call) { |_token| provider_payload }
    begin
      post "/api/v1/auth/google", params: { id_token: "verified-firebase-token", device_name: "Google phone" }
    ensure
      FirebaseIdTokenVerifier.singleton_class.define_method(:call) { |token| original_verifier.call(token) }
    end

    assert_response :success
    assert_equal "google-owner@example.com", response.parsed_body.dig("data", "user", "email")
    google_user = User.find_by!(email: "google-owner@example.com")
    assert_equal signed_up.workspace, google_user.workspace
    assert google_user.member?
    assert_not google_user.owner?
    assert_equal workspace_count, Workspace.count
    assert MobileSession.exists?(user: google_user)
  end

  test "Google login reuses an existing account and workspace" do
    workspace_count = Workspace.count

    with_firebase_payload(email: @user.email, name: @user.full_name) do
      post "/api/v1/auth/google", params: { id_token: "verified-firebase-token", device_name: "Existing Google phone" }
    end

    assert_response :success
    assert_equal @user.id, response.parsed_body.dig("data", "user", "id")
    assert_equal @workspace.id, response.parsed_body.dig("data", "user", "workspace", "id")
    assert_equal workspace_count, Workspace.count
  end

  test "Google login rejects invalid provider tokens and locked accounts" do
    with_firebase_payload(nil) do
      post "/api/v1/auth/google", params: { id_token: "invalid-token", device_name: "Google phone" }
    end
    assert_response :unauthorized
    assert_equal "invalid_provider_token", response.parsed_body.dig("error", "code")

    @user.update!(status: "locked")
    with_firebase_payload(email: @user.email, name: @user.full_name) do
      post "/api/v1/auth/google", params: { id_token: "verified-firebase-token", device_name: "Locked Google phone" }
    end
    assert_response :forbidden
    assert_equal "account_locked", response.parsed_body.dig("error", "code")
  end

  test "forgot password stays accepted when mail delivery fails" do
    with_reset_mail_failure do
      post "/api/v1/auth/password/forgot", params: { email: @user.email }
    end

    assert_response :success
    assert_equal true, response.parsed_body.dig("data", "accepted")
  end

  test "mobile signup still creates account when confirmation email delivery fails" do
    with_confirmation_mail_failure do
      post "/api/v1/auth/signup", params: {
        auth: {
          first_name: "Mobile",
          last_name: "MailFail",
          email: "mobile-mail-fail@example.com",
          password: PASSWORD,
          password_confirmation: PASSWORD
        }
      }
    end

    assert_response :created
    assert_equal false, response.parsed_body.dig("data", "confirmation_email_sent")
    assert User.find_by!(email: "mobile-mail-fail@example.com")
  end

  test "mobile sessions can be listed and revocation immediately invalidates access" do
    login = mobile_login
    token = login.fetch("access_token")
    session_id = MobileSession.find_by_token(login.fetch("refresh_token")).id

    get "/api/v1/mobile_sessions", headers: bearer_headers(token)
    assert_response :success
    assert_equal session_id, response.parsed_body.fetch("data").first.fetch("id")
    assert response.parsed_body.fetch("data").first.fetch("current")

    delete "/api/v1/mobile_sessions/#{session_id}", headers: bearer_headers(token)
    assert_response :success

    get "/api/v1/me", headers: bearer_headers(token)
    assert_response :unauthorized
  end

  test "push device registration is owned by the authenticated workspace and can be disabled" do
    token = mobile_login.fetch("access_token")
    expo_token = "ExponentPushToken[test-mobile-device]"
    put "/api/v1/mobile_device", params: {
      device: {
        expo_push_token: expo_token,
        platform: "android",
        device_identifier: "pixel-test",
        device_name: "Pixel test",
        app_version: "1.0.0"
      }
    }, headers: bearer_headers(token)

    assert_response :success
    device = MobileDevice.find_by!(expo_push_token: expo_token)
    assert_equal @user, device.user
    assert_equal @workspace, device.workspace

    delete "/api/v1/mobile_device", params: { expo_push_token: expo_token }, headers: bearer_headers(token)
    assert_response :success
    refute device.reload.active?
    assert device.disabled_at?
  end

  test "realtime credentials are short lived and bound to the active mobile session" do
    login = mobile_login
    session = MobileSession.find_by_token(login.fetch("refresh_token"))

    post "/api/v1/realtime/token", headers: bearer_headers(login.fetch("access_token"))

    assert_response :success
    payload = response.parsed_body.fetch("data")
    claims = JwtService.decode(payload.fetch("token"))
    assert_equal "cable_access", claims[:type]
    assert_equal session.id, claims[:mobile_session_id]
    assert_operator claims[:exp], :<=, 65.seconds.from_now.to_i
    assert_includes payload.fetch("url"), "token="
  end

  test "owner impersonation is workspace scoped and returns to the authenticated owner" do
    @user.roles = [Role.find_or_create_by!(name: "owner")]
    teammate = create_user(@workspace, "teammate@example.com", "Team")
    login = mobile_login
    token = login.fetch("access_token")

    post "/api/v1/impersonation", params: { user_id: teammate.id }, headers: bearer_headers(token)
    assert_response :success
    impersonated_token = response.parsed_body.dig("data", "access_token")
    assert_equal teammate.id, response.parsed_body.dig("data", "user", "id")
    assert response.parsed_body.dig("data", "impersonating")

    get "/api/v1/me", headers: bearer_headers(impersonated_token)
    assert_response :success
    assert_equal teammate.id, response.parsed_body.dig("data", "id")

    delete "/api/v1/impersonation", headers: bearer_headers(impersonated_token)
    assert_response :success
    assert_equal @user.id, response.parsed_body.dig("data", "user", "id")

    post "/api/v1/impersonation", params: { user_id: @other_user.id }, headers: bearer_headers(response.parsed_body.dig("data", "access_token"))
    assert_response :not_found
  end

  test "legacy v1 resources are normalized and invalid direct uploads return standard errors" do
    token = mobile_login.fetch("access_token")

    get "/api/v1/teams", headers: bearer_headers(token)
    assert_response :success
    assert response.parsed_body.key?("data")

    post "/api/v1/uploads", params: {
      upload: { filename: "empty.pdf", byte_size: 0, checksum: "invalid", content_type: "application/pdf" }
    }, headers: bearer_headers(token)
    assert_response :unprocessable_entity
    assert_equal "invalid_upload", response.parsed_body.dig("error", "code")
  end

  private

  def create_user(workspace, email, first_name)
    workspace.users.create!(
      email: email,
      password: PASSWORD,
      password_confirmation: PASSWORD,
      first_name: first_name,
      last_name: "Tester",
      job_title: "Engineer",
      status: "active",
      confirmed_at: Time.current
    )
  end

  def mobile_login
    post "/api/v1/auth/login", params: {
      auth: { email: @user.email, password: PASSWORD, device_name: "Test device" }
    }
    assert_response :success
    response.parsed_body.fetch("data")
  end

  def bearer_headers(token)
    { "Authorization" => "Bearer #{token}", "Accept" => "application/json" }
  end

  def with_firebase_payload(payload)
    original = FirebaseIdTokenVerifier.method(:call)
    FirebaseIdTokenVerifier.singleton_class.define_method(:call) { |_token| payload }
    yield
  ensure
    FirebaseIdTokenVerifier.singleton_class.define_method(:call) { |token| original.call(token) }
  end

  def with_reset_mail_failure
    original = User.instance_method(:send_reset_password_instructions)
    User.define_method(:send_reset_password_instructions) { raise "SMTP unavailable" }
    yield
  ensure
    User.define_method(:send_reset_password_instructions, original)
  end

  def with_confirmation_mail_failure
    original = User.instance_method(:send_confirmation_instructions)
    User.define_method(:send_confirmation_instructions) { raise "SMTP unavailable" }
    yield
  ensure
    User.define_method(:send_confirmation_instructions, original)
  end
end
