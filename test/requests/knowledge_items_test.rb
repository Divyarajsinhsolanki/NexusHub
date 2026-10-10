require "test_helper"
require "minitest/mock"

class KnowledgeItemsTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Knowledge API", slug: "knowledge-api", kind: "private")
    @foreign_workspace = Workspace.create!(name: "Foreign Knowledge API", slug: "foreign-knowledge-api", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "knowledge-api@example.test")
    @foreign_user = create_test_user(workspace: @foreign_workspace, email: "foreign-knowledge-api@example.test")

    Current.user = @user
    Current.workspace = @workspace
    @run = @user.knowledge_prompt_runs.create!(prompt: "Give me MCP facts", source: "mcp")
    @item = @user.knowledge_items.create!(
      knowledge_prompt_run: @run,
      title: "MCP cards can include citations",
      summary: "Generated cards store sources and tags.",
      category: "tech",
      source_url: "https://example.test/mcp",
      tags: ["mcp", "citations"]
    )

    archived = @user.knowledge_items.create!(
      knowledge_prompt_run: @run,
      title: "Archived MCP card",
      category: "tech",
      source_key: "archived:mcp"
    )
    archived.archive!

    Current.user = @foreign_user
    Current.workspace = @foreign_workspace
    foreign_run = @foreign_user.knowledge_prompt_runs.create!(prompt: "Hidden facts")
    @foreign_user.knowledge_items.create!(
      knowledge_prompt_run: foreign_run,
      title: "Foreign hidden card",
      category: "tech"
    )

    Current.reset_all
    login_as(@user)
  end

  test "native discovery routes return wrapped web card data" do
    { "coding_tip" => "tip", "dev_tool_of_the_day" => "name", "open_issue_spotlight" => "repository" }.each do |path, field|
      get "/api/v1/#{path}"
      assert_response :success
      assert response.parsed_body.dig("data", field).present?
    end
    News::LocalHeadlinesService.stub(:fetch, ->(region:) { { region: region, articles: [{ title: "Local story", url: "https://example.test/story" }] } }) do
      get "/api/v1/news/local_headlines", params: { region: "in" }
      assert_response :success
      assert_equal "in", response.parsed_body.dig("data", "region")
      assert_equal "Local story", response.parsed_body.dig("data", "articles", 0, "title")
    end
    News::PolicyBriefsService.stub(:fetch, ->(topic:) { { topic: topic, briefs: [{ title: "A brief" }] } }) do
      get "/api/v1/news/policy_briefs", params: { topic: "technology" }
      assert_response :success
      assert_equal "technology", response.parsed_body.dig("data", "topic")
    end
  end

  test "lists generated knowledge items scoped to current workspace and user" do
    get "/api/knowledge_items", params: { active: true, category: "tech" }, headers: json_headers

    assert_response :success
    titles = JSON.parse(response.body).map { |item| item.fetch("title") }
    assert_includes titles, "MCP cards can include citations"
    assert_not_includes titles, "Archived MCP card"
    assert_not titles.any? { |title| title.include?("Foreign") }
  end

  test "lists prompt runs with item counts" do
    get "/api/knowledge_prompt_runs", headers: json_headers

    assert_response :success
    run_payload = JSON.parse(response.body).find { |run| run.fetch("id") == @run.id }
    assert_equal "Give me MCP facts", run_payload.fetch("prompt")
    assert_equal 2, run_payload.fetch("item_count")
  end

  test "archives a generated knowledge item" do
    patch "/api/knowledge_items/#{@item.id}/archive", headers: json_headers

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal false, payload.fetch("active")
    assert @item.reload.archived_at.present?
  end

  test "workspace members see daily cards but cannot archive another owner's cards" do
    owner = create_test_user(workspace: @workspace, email: "daily-api-owner@example.test")
    Current.set(workspace: @workspace, user: owner) do
      run = owner.knowledge_prompt_runs.create!(prompt: "Daily tech", source: "bedrock_daily")
      @shared = owner.knowledge_items.create!(knowledge_prompt_run: run, title: "Shared daily tip", payload: { workspace_shared: true })
      private_run = owner.knowledge_prompt_runs.create!(prompt: "Private note")
      owner.knowledge_items.create!(knowledge_prompt_run: private_run, title: "Owner private note")
    end
    Current.set(workspace: @foreign_workspace, user: @foreign_user) do
      run = @foreign_user.knowledge_prompt_runs.create!(prompt: "Foreign daily", source: "bedrock_daily")
      @foreign_user.knowledge_items.create!(knowledge_prompt_run: run, title: "Foreign daily tip", payload: { workspace_shared: true })
    end
    Current.reset_all
    get "/api/knowledge_items", headers: json_headers
    assert_response :success
    items = JSON.parse(response.body)
    shared = items.find { |item| item["id"] == @shared.id }
    assert shared["workspace_shared"]
    assert_equal false, shared["can_archive"]
    assert_not items.any? { |item| ["Owner private note", "Foreign daily tip"].include?(item["title"]) }
    patch "/api/knowledge_items/#{@shared.id}/archive", headers: json_headers
    assert_response :not_found
    assert @shared.reload.active?
  end

  private

  def login_as(user)
    post "/api/login", params: { auth: { email: user.email, password: "Password!42" } }
    assert_response :success
  end

  def json_headers
    { "Accept" => "application/json" }
  end
end
