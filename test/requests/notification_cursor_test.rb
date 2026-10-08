require "test_helper"
class NotificationCursorTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Notice cursor", slug: "notice-cursor", kind: "private")
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: "cursor@example.test")
    @post = Post.create!(user: @user, message: "Notice source")
    @notices = 45.times.map { Notification.create!(recipient: @user, actor: @user, action: "commented", notifiable: @post) }
    post "/api/login", params: { auth: { email: @user.email, password: "Password!42" } }
    assert_response :success
  end
  test "web unread cursor does not skip records after reads and new arrivals" do
    get "/api/notifications", params: { cursor: true, status: "unread" }
    assert_response :success
    first = response.parsed_body
    ids = first["notifications"].map { |notice| notice["id"] }
    cursor = first.dig("meta", "next_before_id")
    @notices.select { |notice| ids.include?(notice.id) }.each(&:mark_as_read!)
    Notification.create!(recipient: @user, actor: @user, action: "commented", notifiable: @post)
    get "/api/notifications", params: { cursor: true, status: "unread", before_id: cursor }
    assert_response :success
    second = response.parsed_body
    ids += second["notifications"].map { |notice| notice["id"] }
    get "/api/notifications", params: { cursor: true, status: "unread", before_id: second.dig("meta", "next_before_id") }
    ids += response.parsed_body["notifications"].map { |notice| notice["id"] }
    assert_equal @notices.map(&:id).sort, ids.sort
    assert_equal ids.uniq, ids
  end
  test "mobile unread cursor remains stable when records are marked read" do
    post "/api/v1/auth/login", params: { auth: { email: @user.email, password: "Password!42", device_name: "Cursor test" } }
    assert_response :success
    headers = { "Authorization" => "Bearer #{response.parsed_body.fetch("data").fetch("access_token")}", "Accept" => "application/json" }
    get "/api/v1/notifications", params: { cursor: true, status: "unread" }, headers: headers
    assert_response :success
    first = response.parsed_body
    ids = first["data"].map { |notice| notice["id"] }
    @notices.select { |notice| ids.include?(notice.id) }.each(&:mark_as_read!)
    get "/api/v1/notifications", params: { cursor: true, status: "unread", before_id: first.dig("meta", "next_before_id") }, headers: headers
    assert_response :success
    assert_equal @notices.map(&:id).sort.reverse.slice(20, 20), response.parsed_body["data"].map { |notice| notice["id"] }
  end
end
