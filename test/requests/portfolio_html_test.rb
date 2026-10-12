require "test_helper"

class PortfolioHtmlTest < ActionDispatch::IntegrationTest
  setup do
    @previous_portfolio_mode = ENV["PORTFOLIO_ENABLED"]
    ENV["PORTFOLIO_ENABLED"] = "true"
    PortfolioSeeder.new.call
  end

  teardown do
    ENV["PORTFOLIO_ENABLED"] = @previous_portfolio_mode
  end

  test "initial HTML contains published profile and project content without JavaScript" do
    project = PortfolioProject.published.first!
    hidden = PortfolioProject.create!(title: "Hidden project", slug: "hidden-project", summary: "Private draft", published: false)
    project.portfolio_features.create!(title: "Hidden feature", category: "Testing", summary: "Private feature", published: false)
    get "/"
    assert_response :success
    assert_select "#root h1", "Divyarajsinh Solanki"
    assert_select "#root h2", "About Divyarajsinh Solanki"
    assert_select "#root h3", "Engineering experience"
    assert_select "#root h3", "Skills"
    assert_select "#root h3", "Engineering achievements"
    assert_select "#root h3", project.title
    assert_select "#root", text: /Ruby on Rails/
    assert_select "#root", text: /#{Regexp.escape(project.summary)}/
    assert_select "#root", text: /Hidden project|Hidden feature/, count: 0
  end

  test "disabled portfolio and workspace pages do not expose portfolio HTML" do
    get "/login"
    assert_select "#root main", count: 0
    ENV["PORTFOLIO_ENABLED"] = "false"
    get "/"
    assert_response :success
    assert_select "#root main", count: 0
    assert_equal "noindex, nofollow", response.headers["X-Robots-Tag"]
  end
end
