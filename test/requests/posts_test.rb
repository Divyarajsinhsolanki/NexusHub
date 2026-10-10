require "test_helper"

class PostsTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Posts API", slug: "posts-api", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "posts-api@example.test")
    Current.user = @user
    Current.workspace = @workspace

    @post = @user.posts.create!(message: "API post")
    6.times do |index|
      @post.comments.create!(user: @user, body: "Comment #{index + 1}")
    end
    @post.post_likes.create!(user: @user)

    login_as(@user)
  end

  test "returns JSON posts with bounded comment previews" do
    get "/api/posts", headers: { "Accept" => "application/json" }

    assert_response :success
    assert_equal "application/json", response.media_type

    payload = JSON.parse(response.body)
    post_payload = payload.fetch("data").first

    assert_equal @post.id, post_payload.fetch("id")
    assert_equal 1, post_payload.fetch("likes_count")
    assert post_payload.fetch("liked_by_current_user")
    assert_equal 6, post_payload.fetch("comments_count")
    assert post_payload.fetch("has_more_comments")
    assert_equal 5, post_payload.fetch("comments").length
    assert_equal 1, payload.dig("meta", "total_count")
  end

  test "post images use inline URLs for existing attachments" do
    @post.image.attach(io: StringIO.new("image data"), filename: "old-post.png", content_type: "image/png")
    get "/api/posts", headers: { "Accept" => "application/json" }
    assert_response :success
    image_url = JSON.parse(response.body).fetch("data").first.fetch("image_url")
    assert_includes image_url, "disposition=inline"
    assert_includes image_url, "old-post.png"
  end

  test "shows a single post with discussion context" do
    get "/api/posts/#{@post.id}", headers: { "Accept" => "application/json" }
    assert_response :success
    payload = response.parsed_body
    assert_equal "API post", payload.fetch("message")
    assert_equal @user.id, payload.dig("user", "id")
    assert_equal 6, payload.fetch("comments_count")
    assert_equal 5, payload.fetch("comments").length
  end

  test "mobile post details and comments support the full discussion lifecycle" do
    post "/api/v1/auth/login", params: { auth: { email: @user.email, password: "Password!42", device_name: "Posts test" } }, as: :json
    assert_response :success
    headers = { "Authorization" => "Bearer #{response.parsed_body.dig('data', 'access_token')}", "Accept" => "application/json" }
    get "/api/v1/posts/#{@post.id}", headers: headers
    assert_response :success
    assert_equal @post.id, response.parsed_body.dig("data", "id")
    post "/api/v1/posts/#{@post.id}/comments", params: { comment: { body: "Comment from mobile" } }, headers: headers, as: :json
    assert_response :created
    created = response.parsed_body.fetch("data")
    assert_equal "Comment from mobile", created.fetch("body")
    assert created.fetch("can_delete")
    get "/api/v1/posts/#{@post.id}/comments", headers: headers
    assert_response :success
    assert_equal 7, response.parsed_body.fetch("data").length
    delete "/api/v1/posts/#{@post.id}/comments/#{created.fetch('id')}", headers: headers
    assert_response :success
    assert response.parsed_body.dig("data", "deleted")
    assert_equal 6, @post.reload.comments_count
  end

  private

  def login_as(user)
    post "/api/login", params: {
      auth: { email: user.email, password: "Password!42" }
    }
    assert_response :success
  end
end
