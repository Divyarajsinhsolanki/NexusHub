require "test_helper"
require "minitest/mock"

class BrowserApiProtectionsTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Browser security", slug: "browser-api-security", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "browser-security@example.test")
  end

  test "native aliases ignore browser cookies and valid bearer requests ignore conflicting cookies" do
    post "/api/login", params: {auth:{email:@user.email,password:"Password!42"}}
    get "/api/v1/users"
    assert_response :unauthorized
    mobile, = MobileSession.issue_for!(user:@user)
    token = MobileAccessToken.issue(mobile)[:token]
    previous = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    post "/api/v1/users/presence", headers:{"Authorization"=>"Bearer #{token}","Origin"=>"null"}
    assert_response :success
    get "/api/v1/users", headers:{"Authorization"=>"Bearer invalid"}
    assert_response :unauthorized
  ensure
    ActionController::Base.allow_forgery_protection = previous
  end

  test "approved browser clients can bootstrap CSRF but still must send the token" do
    previous = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    origin = BrowserSecurity.browser_origins.first
    get "/api/csrf", headers: {"Origin"=>origin}
    assert_response :success
    token = response.parsed_body["csrf_token"]
    assert_equal token, response.headers["X-CSRF-Token"]
    assert_equal "no-store", response.headers["Cache-Control"]
    post "/api/login", params:{auth:{email:@user.email,password:"Password!42"}}, headers:{"Origin"=>origin}
    assert_response :unprocessable_entity
    post "/api/login", params:{auth:{email:@user.email,password:"Password!42"}}, headers:{"Origin"=>origin,"X-CSRF-Token"=>token}
    assert_response :success
  ensure
    ActionController::Base.allow_forgery_protection = previous
  end

  test "cross-origin native login is rejected before creating a session" do
    assert_no_difference "MobileSession.count" do
      post "/api/v1/auth/login", params:{auth:{email:@user.email,password:"Password!42"}}, headers:{"Origin"=>"https://evil.example"}
    end
    assert_response :forbidden
  end

  test "cookie contact submission requires CSRF even with a valid captcha" do
    previous = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    get "/contact"
    csrf = Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"]
    Api::ContactsController.class_eval { alias_method :original_valid_captcha_for_security_test, :valid_captcha?; define_method(:valid_captcha?) { true } }
    attributes={contact:{name:"Browser",email:"contact-security@example.test",message:"A legitimate message"}}
    assert_no_difference "Contact.count" do
      post "/api/contacts",params:attributes
      assert_response :unprocessable_entity
    end
    post "/api/contacts",params:attributes,headers:{"X-CSRF-Token"=>csrf}
    assert_response :created
  ensure
    ActionController::Base.allow_forgery_protection = previous
    Api::ContactsController.class_eval { alias_method :valid_captcha?, :original_valid_captcha_for_security_test; remove_method :original_valid_captcha_for_security_test } if Api::ContactsController.method_defined?(:original_valid_captcha_for_security_test) || Api::ContactsController.private_method_defined?(:original_valid_captcha_for_security_test)
  end

  test "preflights separate browser credentials from native credentials and reject unknown origins" do
    origin=BrowserSecurity.api_origins.first
    options "/api/v1/users",headers:{"Origin"=>origin,"Access-Control-Request-Method"=>"POST","Access-Control-Request-Headers"=>"Authorization, Content-Type"}
    assert_equal origin,response.headers["Access-Control-Allow-Origin"]
    assert_nil response.headers["Access-Control-Allow-Credentials"]
    options "/api/users",headers:{"Origin"=>BrowserSecurity.browser_origins.first,"Access-Control-Request-Method"=>"POST","Access-Control-Request-Headers"=>"X-CSRF-Token, Content-Type"}
    assert_equal "true",response.headers["Access-Control-Allow-Credentials"]
    assert_includes response.headers["Access-Control-Expose-Headers"],"X-CSRF-Token"
    options "/api/v1/users",headers:{"Origin"=>"https://evil.example","Access-Control-Request-Method"=>"POST"}
    assert_nil response.headers["Access-Control-Allow-Origin"]
  end

  test "HTML uses fresh script nonces and sensitive API responses cannot be cached" do
    get "/login"
    csp=response.headers["Content-Security-Policy"]
    assert_includes csp,"default-src 'self'"
    scripts = csp.split(';').find { |directive| directive.strip.start_with?('script-src ') }
    assert_includes scripts, "https://apis.google.com"
    refute_includes scripts, "https://*.google.com"
    assert_includes csp,"worker-src 'self' blob:"
    refute_includes csp.split(';').find{|directive|directive.strip.start_with?('script-src')},"unsafe-inline"
    refute_includes csp,"unsafe-eval"
    nonce=Nokogiri::HTML(response.body).at_css('meta[name="csp-nonce"]')["content"]
    assert_includes csp,"'nonce-#{nonce}'"
    get "/login"
    refute_equal nonce,Nokogiri::HTML(response.body).at_css('meta[name="csp-nonce"]')["content"]
    assert_equal "no-store",response.headers["Cache-Control"]
    get "/api/session"
    assert_equal "no-store",response.headers["Cache-Control"]
    assert_equal "nosniff",response.headers["X-Content-Type-Options"]
  end

  test "production allowlists reject wildcard null insecure and path origins" do
    %w[* null http://example.com https://example.com/path https://user@example.com https://*.example.com].each do |origin|
      assert_raises(ArgumentError){BrowserSecurity.origins(origin,production:true)}
    end
    assert_equal ["https://app.example.com"],BrowserSecurity.origins("https://app.example.com/",production:true)
  end
end
