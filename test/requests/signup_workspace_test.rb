require "test_helper"

class SignupWorkspaceTest < ActionDispatch::IntegrationTest
  setup do
    @regular_workspace = Workspace.regular!
  end

  test "public signup creates an isolated company workspace with owner access" do
    assert_difference "Workspace.count", 1 do
      assert_difference "User.count", 1 do
        post "/api/signup", params: {
          auth: {
            company_name: "Acme Office",
            first_name: "New",
            last_name: "Owner",
            email: "new-owner@example.test",
            password: "Password!42",
            job_title: "Engineer"
          }
        }
      end
    end

    assert_response :created
    user = User.find_by!(email: "new-owner@example.test")
    assert_not_equal @regular_workspace, user.workspace
    assert_equal "Acme Office", user.workspace.name
    assert user.owner?

    payload = JSON.parse(response.body)
    assert_equal "starter", payload.dig("user", "workspace", "saas", "plan", "key")
    assert_equal "trialing", user.workspace.billing_status
  end
  test "signup isolates the new owner even when the browser is signed into another company" do
    existing = create_test_user(workspace: @regular_workspace, email: "existing-company@example.test")
    post "/api/login", params: { auth: { email: existing.email, password: "Password!42" } }
    complete_test_mfa
    assert_response :success
    post "/api/signup", params: { auth: { company_name: "New Company", first_name: "New", last_name: "Owner", email: "new-company@example.test", password: "Password!42" } }
    assert_response :created
    created = User.find_by!(email: "new-company@example.test")
    assert_not_equal existing.workspace_id, created.workspace_id
    assert created.owner?
    assert_equal created.workspace_id, UserRole.unscoped.find_by!(user_id: created.id).workspace_id
  end

  test "failed signup does not leave an orphan workspace" do
    assert_no_difference "Workspace.count" do
      post "/api/signup", params: { auth: { first_name: "Invalid", email: "invalid", password: "short" } }
    end
    assert_response :unprocessable_entity
  end

  test "companies with the same name and email domain stay isolated across web and mobile" do
    post "/api/signup", params: { auth: { company_name: "Same Company", first_name: "First", last_name: "Owner", email: "first@same.example", password: "Password!42" } }
    assert_response :created
    first = User.find_by!(email: "first@same.example")
    post "/api/v1/auth/signup", params: { auth: { company_name: "Same Company", first_name: "Second", last_name: "Owner", email: "second@same.example", password: "Password!42", password_confirmation: "Password!42", workspace_id: first.workspace_id, roles: ["site_admin"] } }
    assert_response :created
    second = User.find_by!(email: "second@same.example")
    assert_not_equal first.workspace_id, second.workspace_id
    assert second.owner?
    assert_not second.site_admin?
    project = Project.create!(workspace: first.workspace, owner: first, name: "Confidential")
    second.confirm
    post "/api/v1/auth/login", params: { auth: { email: second.email, password: "Password!42" } }
    complete_test_mfa native: true
    assert_response :success
    token = response.parsed_body.dig("data", "access_token")
    get "/api/v1/projects/#{project.id}", headers: { "Authorization" => "Bearer #{token}" }
    assert_response :not_found
  end
  test "duplicate email and invalid company names never leave partial tenants on either signup API" do
    existing = create_test_user(workspace: @regular_workspace, email: "duplicate-signup@example.test")
    ["/api/signup", "/api/v1/auth/signup"].each do |path|
      [{ email: existing.email, company_name: "Duplicate" },
       { email: "long-name-#{path.include?('v1') ? 'mobile' : 'web'}@example.test", company_name: "X" * 121 },
       { email: "invalid-mobile@example.test", company_name: "Invalid", password: "short" }].each do |attributes|
        assert_no_difference ["Workspace.count", "User.count", "UserRole.unscoped.count"] do
          post path, params: { auth: { first_name: "New", last_name: "Owner", password: "Password!42" }.merge(attributes) }
        end
        assert_response :unprocessable_entity
      end
    end
    assert_equal @regular_workspace, existing.reload.workspace
    assert_not existing.owner?
  end

  test "new web company owners cannot list read update or delete another company's projects" do
    owners = ["alpha", "beta"].map do |name|
      post "/api/signup", params: { auth: { company_name: "Same Company", first_name: name, last_name: "Owner", email: "#{name}@isolation.example", password: "Password!42", workspace_id: @regular_workspace.id, site_admin: true, roles: ["site_admin"] } }
      assert_response :created
      user = User.find_by!(email: "#{name}@isolation.example")
      user.confirm
      assert_not user.site_admin?
      user
    end
    source = Project.create!(workspace: owners.first.workspace, owner: owners.first, name: "Alpha confidential")
    post "/api/login", params: { auth: { email: owners.last.email, password: "Password!42" } }
    complete_test_mfa
    assert_response :success

    get "/api/projects", params: { workspace_id: owners.first.workspace_id }, headers: { "X-Workspace-Id" => owners.first.workspace_id.to_s }
    assert_response :success
    assert_empty response.parsed_body.fetch("data")
    get "/api/projects/#{source.id}"
    assert_response :not_found
    patch "/api/projects/#{source.id}", params: { project: { name: "Stolen" } }
    assert_response :not_found
    delete "/api/projects/#{source.id}"
    assert_response :not_found
    assert_equal "Alpha confidential", source.reload.name

    post "/api/projects", params: { project: { name: "Beta project", workspace_id: owners.first.workspace_id } }
    assert_response :created
    assert_equal owners.last.workspace_id, Project.unscoped.find(response.parsed_body.fetch("id")).workspace_id
  end

end
