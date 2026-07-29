require "test_helper"

class MobilePortfolioApiTest < ActionDispatch::IntegrationTest
  PASSWORD = "Password!42"

  setup do
    @previous_demo_mode = ENV["DEMO_MODE_ENABLED"]
    @previous_portfolio_mode = ENV["PORTFOLIO_ENABLED"]
    ENV["DEMO_MODE_ENABLED"] = "true"
    ENV["PORTFOLIO_ENABLED"] = "true"
    PortfolioSeeder.new.call
  end

  teardown do
    ENV["DEMO_MODE_ENABLED"] = @previous_demo_mode
    ENV["PORTFOLIO_ENABLED"] = @previous_portfolio_mode
  end

  test "published portfolio uses the normalized public mobile contract" do
    get "/api/v1/portfolio"

    assert_response :success
    assert_equal "Divyarajsinh Solanki", response.parsed_body.dig("data", "profile", "full_name")
    assert_equal "Nexus Hub", response.parsed_body.dig("data", "projects", 0, "title")
    assert response.parsed_body.dig("data", "projects", 0, "features").all? { |feature| feature["screenshot_url"].present? }
  end

  test "demo login issues a read only Bearer session" do
    DemoWorkspaceSeeder.new.call

    post "/api/v1/auth/demo", params: { device_name: "Android demo" }, headers: { "Origin" => "null" }

    assert_response :success
    payload = response.parsed_body.fetch("data")
    assert payload.fetch("access_token").present?
    assert payload.dig("user", "demo_account")

    get "/api/v1/demo/manifest", headers: bearer_headers(payload.fetch("access_token"))
    assert_response :success
    assert_equal 6, response.parsed_body.dig("data", "groups").length

    post "/api/v1/posts",
      params: { post: { message: "Must remain read only" } },
      headers: bearer_headers(payload.fetch("access_token"))

    assert_response :forbidden
    assert_equal "demo_read_only", response.parsed_body.dig("error", "code")
  end

  test "site administrators can manage portfolio records through normalized endpoints" do
    site_admin = create_user("portfolio-mobile-admin@example.test", site_admin: true)
    token = login(site_admin)

    get "/api/v1/portfolio_admin", headers: bearer_headers(token)
    assert_response :success
    assert response.parsed_body.dig("data", "projects").present?

    post "/api/v1/portfolio_admin/projects", params: {
      portfolio_project: {
        title: "Mobile case study",
        slug: "mobile-case-study",
        summary: "A native portfolio management workflow.",
        stack: ["Expo", "Rails"],
        published: true
      }
    }, headers: bearer_headers(token)

    assert_response :created
    project_id = response.parsed_body.dig("data", "id")

    post "/api/v1/portfolio_admin/projects/#{project_id}/features", params: {
      portfolio_feature: {
        category: "Mobile",
        title: "Demo access",
        summary: "A read-only native product tour.",
        published: true
      }
    }, headers: bearer_headers(token)

    assert_response :created
    assert_equal "Demo access", response.parsed_body.dig("data", "title")
  end

  test "portfolio administration rejects non site administrators" do
    member = create_user("portfolio-mobile-member@example.test")

    get "/api/v1/portfolio_admin", headers: bearer_headers(login(member))

    assert_response :forbidden
    assert_equal "forbidden", response.parsed_body.dig("error", "code")
  end

  private

  def create_user(email, site_admin: false)
    workspace = Workspace.create!(name: email, slug: "mobile-portfolio-#{SecureRandom.hex(4)}", kind: "private")
    workspace.users.create!(
      email: email,
      password: PASSWORD,
      password_confirmation: PASSWORD,
      first_name: "Mobile",
      last_name: "Tester",
      job_title: "Engineer",
      status: "active",
      confirmed_at: Time.current,
      site_admin: site_admin
    )
  end

  def login(user)
    post "/api/v1/auth/login", params: {
      auth: { email: user.email, password: PASSWORD, device_name: "Portfolio test" }
    }
    assert_response :success
    response.parsed_body.dig("data", "access_token")
  end

  def bearer_headers(token)
    { "Authorization" => "Bearer #{token}", "Accept" => "application/json" }
  end
end
