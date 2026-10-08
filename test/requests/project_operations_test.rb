require "test_helper"

class ProjectOperationsRequestTest < ActionDispatch::IntegrationTest
  setup do
    @previous_key = ENV["PROJECT_OPERATIONS_ENCRYPTION_KEY"]
    ENV["PROJECT_OPERATIONS_ENCRYPTION_KEY"] = "a1" * 32
    @workspace = Workspace.create!(name: "Operations API", slug: "operations-api", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "operations-api@example.test")
    Current.workspace = @workspace
    @project = Project.create!(name: "Operations API project", owner: @user)
    @membership = ProjectUser.create!(project: @project, user: @user, role: "developer", status: "active")
    @environment = ProjectEnvironment.create!(project: @project, name: "Production")
    Current.reset_all
    post "/api/login", params: { auth: { email: @user.email, password: "Password!42" } }
    assert_response :success
  end

  teardown do
    ENV["PROJECT_OPERATIONS_ENCRYPTION_KEY"] = @previous_key
  end

  test "snapshot permissions and mutation serialization are enforced at the HTTP boundary" do
    get endpoint
    assert_response :success
    assert_equal "no-store", response.headers["Cache-Control"]
    assert response.parsed_body["can_edit"]
    post "#{endpoint}/items", params: { revision: 0, item: { kind: "configuration", name: "TOKEN", entries: [{ environment_id: @environment.id, value: "never-return-this" }] } }, as: :json
    assert_response :created
    assert_not_includes response.body, "never-return-this"
    id = response.parsed_body.dig("item", "id")

    patch "#{endpoint}/items/#{id}/entries/#{@environment.id}", params: { revision: 0, entry: { value: "stale" } }, as: :json
    assert_response :conflict
    assert_equal 1, response.parsed_body["revision"]

    @membership.update!(role: "viewer")
    get endpoint
    assert_response :success
    assert_not response.parsed_body["can_edit"]
    patch "#{endpoint}/items/#{id}", params: { revision: 1, item: { description: "Denied" } }, as: :json
    assert_response :forbidden
    @membership.update!(status: "removed")
    get endpoint
    assert_response :not_found
  end

  test "import preview is value-free and commit uses the same parser" do
    payload = { format: "env", environment_id: @environment.id, content: "API_KEY=hidden-input\nLOG_LEVEL=info" }
    post "#{endpoint}/imports/preview", params: payload, as: :json
    assert_response :success
    assert_equal %w[API_KEY LOG_LEVEL], response.parsed_body["rows"].map { |row| row["name"] }
    assert_not_includes response.body, "hidden-input"
    post "#{endpoint}/imports/commit", params: payload.merge(revision: 0, selected_keys: ["API_KEY"]), as: :json
    assert_response :success
    assert_equal 1, response.parsed_body["imported_count"]
    get endpoint
    assert_response :success
    assert_not_includes response.body, "hidden-input"
    assert_equal ["API_KEY"], response.parsed_body["items"].map { |item| item["name"] }
  end

  test "a member of another workspace cannot access a project by ID" do
    other = Workspace.create!(name: "Foreign operations", slug: "foreign-operations", kind: "private")
    foreign_project = Project.create!(workspace: other, name: "Foreign project")
    get "/api/projects/#{foreign_project.id}/operations"
    assert_response :not_found
  end

  test "API supports atomic entries labelled endpoints and explicit version import destination" do
    post "#{endpoint}/items", params: { revision: 0, item: { kind: "service", name: "Payment gateway" } }, as: :json
    assert_response :created
    id = response.parsed_body.dig("item", "id")
    patch "#{endpoint}/items/#{id}", params: { revision: 1, item: { description: "Updated", entries: [
      { environment_id: @environment.id, details: { endpoints: [{ label: "API", url: "https://gateway.example.test" }] } }
    ] } }, as: :json
    assert_response :success
    assert_equal "https://gateway.example.test", response.parsed_body.dig("item", "entries", 0, "details", "endpoints", 0, "url")
    payload = { format: "versions", version_destination: "expected", environment_id: @environment.id, content: "name,expected_version\nRuby,3.3.12" }
    post "#{endpoint}/imports/preview", params: payload, as: :json
    assert_response :success
    assert_equal "3.3.12", response.parsed_body.dig("rows", 0, "expected_version")
    post "#{endpoint}/imports/commit", params: payload.merge(revision: 2, selected_keys: ["Ruby"]), as: :json
    assert_response :success
    get endpoint
    assert_response :success
    assert response.parsed_body.key?("deployments")
    ruby = response.parsed_body["items"].find { |item| item["name"] == "Ruby" }
    assert_equal "3.3.12", ruby.dig("entries", 0, "expected_version")
    assert_nil ruby.dig("entries", 0, "observed_version")
  end

  test "malformed imports return safe validation errors without source values" do
    ["name,observed_version\nRedis,secret-version,unexpected", "TOKEN=private\nINVALID private"].each do |content|
      post "#{endpoint}/imports/preview", params: { format: content.start_with?("name") ? "versions" : "env", environment_id: @environment.id, content: content }, as: :json
      assert_response :unprocessable_entity
      assert_not_includes response.body, "secret-version"
      assert_not_includes response.body, "private"
    end
  end

  private

  def endpoint
    "/api/projects/#{@project.id}/operations"
  end
end
