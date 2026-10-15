require "test_helper"

class AuthenticatedResourceLimitsTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "API resource limits", slug: "api-resource-limits", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "api-budget@example.test")
    post "/api/login", params: { auth: { email: @user.email, password: "Password!42" } }, as: :json
    complete_test_mfa
    assert_response :success
    @old_store = Rack::Attack.cache.store
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
  end
  teardown { Rack::Attack.cache.store = @old_store }

  test "web and native share the actor write counter and rejected requests have no side effects" do
    120.times { AbusePrevention::RateLimiter.check!(@user, :writes) }
    before = Post.unscoped.count
    post "/api/posts", params: { post: { message: "Blocked" } }, as: :json
    assert_response :too_many_requests
    assert_operator response.headers["Retry-After"].to_i, :>, 0
    assert_equal before, Post.unscoped.count
    session, = MobileSession.issue_for!(user: @user)
    token = JwtService.encode({ user_id: @user.id, type: "mobile_access", mobile_session_id: session.id })
    post "/api/v1/posts", params: { post: { message: "Still blocked" } }, headers: { "Authorization" => "Bearer #{token}" }, as: :json
    assert_response :too_many_requests
    assert response.parsed_body["error"].is_a?(Hash)
    assert_equal before, Post.unscoped.count
  end

  test "GET account exports are limited without blocking ordinary reads" do
    5.times { AbusePrevention::RateLimiter.check!(@user, :exports) }
    get "/api/account/export"
    assert_response :too_many_requests
    get "/api/posts"
    assert_response :success
  end
end
