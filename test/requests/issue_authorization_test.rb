require "test_helper"

class IssueAuthorizationTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Issue Security", slug: "issue-security", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "issue-reader@example.test")
    @owner = create_test_user(workspace: @workspace, email: "issue-owner@example.test")
    Current.workspace = @workspace
    @project = Project.create!(name: "Restricted project", owner: @owner)
    @issue = @project.issues.create!(title: "Confidential issue", status: "New", severity: "High")
    Current.reset_all
    post "/api/login", params: { auth: { email: @user.email, password: "Password!42" } }
    assert_response :success
  end

  test "same workspace nonmembers cannot list mutate or import issues" do
    get "/api/issues", params: { project_id: @project.id }
    assert_response :not_found
    patch "/api/issues/#{@issue.id}", params: { project_id: @project.id, issue: { title: "Changed" } }
    assert_response :not_found
    delete "/api/issues/#{@issue.id}", params: { project_id: @project.id }
    assert_response :not_found
    post "/api/issues", params: { issue: { project_id: @project.id, title: "Injected" } }
    assert_response :not_found
    post "/api/issues/import_from_sheet", params: { project_id: @project.id }
    assert_response :not_found
    assert_equal "Confidential issue", @issue.reload.title
  end

  test "active members can read and edit but removed members cannot" do
    membership = ProjectUser.create!(workspace: @workspace, project: @project, user: @user, status: "active")
    get "/api/issues", params: { project_id: @project.id }
    assert_response :success
    assert_equal [@issue.id], response.parsed_body.map { |issue| issue["id"] }
    patch "/api/issues/#{@issue.id}", params: { project_id: @project.id, issue: { title: "Updated" } }
    assert_response :success
    membership.update!(status: "removed")
    get "/api/issues", params: { project_id: @project.id }
    assert_response :not_found
  end

  test "workspace owners retain issue access" do
    UserRole.create!(workspace: @workspace, user: @user, role: Role.find_by!(name: "owner"))
    get "/api/issues", params: { project_id: @project.id }
    assert_response :success
  end

  test "search and MCP do not bypass issue membership" do
    get "/api/search", params: { q: "Confidential", types: "issues" }
    assert_response :success
    assert_empty response.parsed_body["results"]
    token, = McpAccessToken.issue!(user: @user, name: "issue-security")
    executor = Mcp::ToolExecutor.new(user: @user, token: token)
    assert_equal 0, executor.call("list_issues", { project_id: @project.id })[:count]
    assert_raises(ActiveRecord::RecordNotFound) { executor.call("get_project", { project_id: @project.id }) }
    assert_raises(ActiveRecord::RecordNotFound) do
      executor.call("update_issue", { id: @issue.id, title: "Unauthorized" })
    end
  end
end
