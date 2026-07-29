require "test_helper"

class SignupWorkspaceTest < ActionDispatch::IntegrationTest
  setup do
    @regular_workspace = Workspace.regular!
  end

  test "public signup joins the regular workspace as a member" do
    assert_no_difference "Workspace.count" do
      assert_difference "User.count", 1 do
        post "/api/signup", params: {
          auth: {
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
    assert_equal @regular_workspace, user.workspace
    assert user.member?
    assert_not user.owner?

    payload = JSON.parse(response.body)
    assert_equal "enterprise", payload.dig("user", "workspace", "saas", "plan", "key")
    assert_nil payload.dig("user", "workspace", "saas", "limits", "seats")
  end
end
