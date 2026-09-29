require "test_helper"

class PublicDiscoveryTest < ActionDispatch::IntegrationTest
  setup do
    @previous_portfolio_mode = ENV["PORTFOLIO_ENABLED"]
    ENV["PORTFOLIO_ENABLED"] = "true"
  end

  teardown do
    ENV["PORTFOLIO_ENABLED"] = @previous_portfolio_mode
  end

  test "sitemap and robots expose public portfolio discovery routes" do
    base_url = ENV.fetch("BASE_URL", "http://www.example.com").delete_suffix("/")

    get "/sitemap.xml"
    assert_response :success
    assert_includes response.body, "<loc>#{base_url}/</loc>"
    assert_includes response.body, "<loc>#{base_url}/contact</loc>"

    get "/robots.txt"
    assert_response :success
    assert_includes response.body, "Allow: /"
    assert_includes response.body, "Disallow: /admin"
    assert_includes response.body, "Sitemap: #{base_url}/sitemap.xml"
  end

  test "disabled portfolio mode exposes the login runtime flag and removes portfolio discovery routes" do
    ENV.delete("PORTFOLIO_ENABLED")

    get "/"
    assert_response :success
    assert_select 'meta[name="nexus-portfolio-enabled"][content="false"]', count: 1
    assert_select "title", text: "Nexus Hub | Workspace Login"

    get "/sitemap.xml"
    assert_response :success
    assert_not_includes response.body, "/contact"
  end

  test "public browser integrations are exposed as runtime configuration" do
    previous_values = {
      "RECAPTCHA_ENABLED" => ENV["RECAPTCHA_ENABLED"],
      "VITE_RECAPTCHA_SITE_KEY" => ENV["VITE_RECAPTCHA_SITE_KEY"],
      "RECAPTCHA_SECRET_KEY" => ENV["RECAPTCHA_SECRET_KEY"],
      "PORTFOLIO_CONTACT_EMAIL" => ENV["PORTFOLIO_CONTACT_EMAIL"],
      "VITE_FIREBASE_API_KEY" => ENV["VITE_FIREBASE_API_KEY"],
      "VITE_FIREBASE_AUTH_DOMAIN" => ENV["VITE_FIREBASE_AUTH_DOMAIN"],
      "VITE_FIREBASE_PROJECT_ID" => ENV["VITE_FIREBASE_PROJECT_ID"],
      "VITE_FIREBASE_APP_ID" => ENV["VITE_FIREBASE_APP_ID"]
    }

    ENV.update(
      "RECAPTCHA_ENABLED" => "true",
      "VITE_RECAPTCHA_SITE_KEY" => "recaptcha-site-key",
      "RECAPTCHA_SECRET_KEY" => "recaptcha-secret-key",
      "PORTFOLIO_CONTACT_EMAIL" => "hello@example.test",
      "VITE_FIREBASE_API_KEY" => "firebase-api-key",
      "VITE_FIREBASE_AUTH_DOMAIN" => "example.firebaseapp.com",
      "VITE_FIREBASE_PROJECT_ID" => "example-project",
      "VITE_FIREBASE_APP_ID" => "firebase-app-id"
    )

    get "/"

    assert_response :success
    assert_select 'meta[name="nexus-contact-endpoint-enabled"][content="true"]', count: 1
    assert_select 'meta[name="nexus-recaptcha-site-key"][content="recaptcha-site-key"]', count: 1
    assert_select 'meta[name="nexus-contact-email"][content="hello@example.test"]', count: 1
    assert_select 'meta[name="nexus-firebase-api-key"][content="firebase-api-key"]', count: 1
    assert_select 'meta[name="nexus-firebase-auth-domain"][content="example.firebaseapp.com"]', count: 1
    assert_select 'meta[name="nexus-firebase-project-id"][content="example-project"]', count: 1
    assert_select 'meta[name="nexus-firebase-app-id"][content="firebase-app-id"]', count: 1
  ensure
    previous_values&.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end

  test "contact endpoint runtime configuration is disabled without complete server credentials" do
    previous_values = %w[RECAPTCHA_ENABLED VITE_RECAPTCHA_SITE_KEY RECAPTCHA_SECRET_KEY].to_h { |key| [key, ENV[key]] }
    ENV.update("RECAPTCHA_ENABLED" => "true", "VITE_RECAPTCHA_SITE_KEY" => "recaptcha-site-key")
    ENV.delete("RECAPTCHA_SECRET_KEY")

    get "/"

    assert_response :success
    assert_select 'meta[name="nexus-contact-endpoint-enabled"][content="false"]', count: 1
    assert_select 'meta[name="nexus-recaptcha-site-key"][content=""]', count: 1
  ensure
    previous_values&.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end
end
