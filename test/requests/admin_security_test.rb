require "test_helper"
require "minitest/mock"

class AdminSecurityTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Security", slug: "admin-security", kind: "private")
    @foreign_workspace = Workspace.create!(name: "Foreign", slug: "admin-security-foreign", kind: "private")
    @admin = create_test_user(workspace: @workspace, email: "security-admin@example.test")
    @outsider = create_test_user(workspace: @foreign_workspace, email: "security-outsider@example.test")
    Current.workspace = @workspace
    @admin.roles = [Role.find_by!(name: "admin")]
    post "/api/login", params: { auth: { email: @admin.email, password: "Password!42" } }
    assert_response :success
  end

  test "workspace admin cannot read update or delete foreign users" do
    get "/api/admin/User", params: { filters: { id: @outsider.id } }
    assert_response :success
    assert_empty response.parsed_body.fetch("records")
    patch "/api/admin/User/#{@outsider.id}", params: { record: { first_name: "Changed" } }
    assert_response :not_found
    delete "/api/admin/User/#{@outsider.id}"
    assert_response :not_found
    assert_equal "PDF", @outsider.reload.first_name
  end

  test "workspace admin cannot grant owner or rename roles" do
    post "/api/admin/UserRole", params: { record: { user_id: @admin.id, role_id: Role.find_by!(name: "owner").id } }
    assert_response :unprocessable_entity
    patch "/api/admin/Role/#{Role.find_by!(name: 'admin').id}", params: { record: { name: "owner" } }
    assert_response :forbidden
    assert_not @admin.reload.owner?
  end

  test "admin cannot bypass dedicated user mutation permissions" do
    patch "/api/admin/User/#{@admin.id}", params: { record: { first_name: "Bypass" } }
    assert_response :forbidden
  end

  test "workspace admin cannot access global workspace configuration" do
    get "/api/admin/Workspace"
    assert_response :unprocessable_entity
    get "/api/admin/tables"
    assert_response :success
    assert_not_includes response.parsed_body, "UserRole"
    assert_not_includes response.parsed_body, "Workspace"
  end

  test "generic writes cannot move records into another workspace" do
    post "/api/admin/Project", params: { record: { name: "Scoped create", workspace_id: @foreign_workspace.id } }
    assert_response :success
    project_id = response.parsed_body.fetch("id")
    assert_equal @workspace.id, Project.unscoped.find(project_id).workspace_id
    patch "/api/admin/Project/#{project_id}", params: { record: { workspace_id: @foreign_workspace.id, name: "Scoped update" } }
    assert_response :success
    assert_equal @workspace.id, Project.unscoped.find(project_id).workspace_id
  end

  test "unsafe Keka credentials are rejected before persistence" do
    Resolv.stub(:getaddresses, ["169.254.169.254"]) do
      post "/api/keka/credentials", params: { keka: { base_url: "https://metadata.example.test", api_key: "secret", employee_id: "12" } }
    end
    assert_response :unprocessable_entity
    assert_nil @admin.reload.keka_base_url
    assert_nil @admin.keka_api_key
  end

  test "invalid calendar enums return validation errors" do
    %w[visibility status].each do |field|
      post "/api/calendar_events", params: { calendar_event: {
        title: "Invalid enum", start_at: "2026-10-10T09:00:00Z", end_at: "2026-10-10T10:00:00Z",
        event_type: "meeting", visibility: "personal", status: "scheduled", field => "unsupported"
      } }
      assert_response :unprocessable_entity
    end
  end
end
