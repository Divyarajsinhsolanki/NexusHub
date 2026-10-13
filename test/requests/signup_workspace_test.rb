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
    assert_response :success
    token = response.parsed_body.dig("data", "access_token")
    get "/api/v1/projects/#{project.id}", headers: { "Authorization" => "Bearer #{token}" }
    assert_response :not_found
  end
end
