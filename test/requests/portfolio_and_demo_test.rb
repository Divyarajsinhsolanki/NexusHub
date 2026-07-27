require "test_helper"

class PortfolioAndDemoTest < ActionDispatch::IntegrationTest
  setup do
    PortfolioSeeder.new.call
    @previous_demo_mode = ENV["DEMO_MODE_ENABLED"]
    @previous_portfolio_mode = ENV["PORTFOLIO_ENABLED"]
    ENV["DEMO_MODE_ENABLED"] = "true"
    ENV["PORTFOLIO_ENABLED"] = "true"
    DemoWorkspaceSeeder.new.call
  end

  teardown do
    ENV["DEMO_MODE_ENABLED"] = @previous_demo_mode
    ENV["PORTFOLIO_ENABLED"] = @previous_portfolio_mode
  end

  test "published portfolio is public" do
    get "/api/portfolio"

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "Divyarajsinh Solanki", payload.dig("profile", "full_name")
    assert_equal "Nexus Hub", payload.dig("projects", 0, "title")
    assert payload.dig("projects", 0, "cover_image_url").present?
    assert payload.dig("projects", 0, "features").all? { |feature| feature["screenshot_url"].present? }
    assert_match %r{\A/portfolio-seed-images/}, payload.dig("projects", 0, "cover_image_url")
    assert payload.dig("projects", 0, "features").all? { |feature| feature["screenshot_url"].start_with?("/portfolio-seed-images/") }
  end

  test "demo session exposes manifest and rejects mutations" do
    post "/api/demo_session"
    assert_response :success
    assert JSON.parse(response.body).dig("user", "demo_account")

    get "/api/demo/manifest"
    assert_response :success
    assert_equal 6, JSON.parse(response.body).fetch("groups").length

    post "/api/posts", params: { post: { message: "Should not persist" } }
    assert_response :forbidden
    assert_equal "demo_read_only", JSON.parse(response.body).fetch("error")

    post "/api/pdf_documents"
    assert_response :forbidden
    assert_equal "demo_read_only", JSON.parse(response.body).fetch("error")
  end

  test "demo reads do not change database state" do
    post "/api/demo_session"
    assert_response :success

    workspace = Workspace.find_by!(kind: "demo")
    conversation = Conversation.unscoped.where(workspace: workspace).first!
    participant = ConversationParticipant.unscoped.find_by!(workspace: workspace, conversation: conversation, user: workspace.users.find_by!(demo_account: true))
    before_state = {
      participant_read_at: participant.last_read_at,
      notification_reads: Notification.unscoped.where(workspace: workspace).pluck(:id, :read_at),
      record_counts: [
        Project.unscoped.where(workspace: workspace).count,
        Task.unscoped.where(workspace: workspace).count,
        Post.unscoped.where(workspace: workspace).count
      ]
    }

    get "/api/demo/manifest"
    assert_response :success
    get "/api/search", params: { q: "Nexus" }
    assert_response :success
    get "/api/activity"
    assert_response :success
    get "/api/conversations/#{conversation.id}"
    assert_response :success

    if before_state[:participant_read_at].nil?
      assert_nil participant.reload.last_read_at
    else
      assert_equal before_state[:participant_read_at], participant.reload.last_read_at
    end
    assert_equal before_state[:notification_reads], Notification.unscoped.where(workspace: workspace).pluck(:id, :read_at)
    assert_equal before_state[:record_counts], [
      Project.unscoped.where(workspace: workspace).count,
      Task.unscoped.where(workspace: workspace).count,
      Post.unscoped.where(workspace: workspace).count
    ]
  end

  test "portfolio and demo endpoints are unavailable when portfolio mode is disabled" do
    ENV["PORTFOLIO_ENABLED"] = "false"

    get "/api/portfolio"
    assert_response :not_found

    post "/api/demo_session"
    assert_response :not_found
  end
end
