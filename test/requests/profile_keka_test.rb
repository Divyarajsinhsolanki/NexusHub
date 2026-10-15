require "test_helper"

class ProfileKekaTest < ActionDispatch::IntegrationTest
  test "profile remains available when stored Keka credentials cannot be decrypted" do
    workspace = Workspace.create!(name: "Profile Keka", slug: "profile-keka", kind: "private")
    user = workspace.users.create!(
      email: "profile-keka@example.test",
      password: "Password!42",
      password_confirmation: "Password!42",
      first_name: "Profile",
      last_name: "User",
      job_title: "Engineer",
      status: "active",
      confirmed_at: Time.current,
      keka_base_url: "https://keka.example.test",
      keka_employee_id: "EMP-2"
    )
    user.update_columns(
      encrypted_keka_api_key: Base64.strict_encode64("invalid ciphertext"),
      encrypted_keka_api_key_iv: Base64.strict_encode64("invalid iv")
    )

    post "/api/login", params: {
      auth: { email: user.email, password: "Password!42" }
    }
    complete_test_mfa
    assert_response :success

    get "/api/view_profile"

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal user.id, payload.dig("user", "id")
    assert_not payload.dig("keka", "connected")

    user.update!(keka_api_key: "saved-personal-secret", keka_profile_data: {
      api_key: "saved-personal-secret", description: "echo saved-personal-secret", employee_name: "Employee"
    })
    get "/api/keka/profile"
    assert_response :success
    refute_includes response.body, "saved-personal-secret"
    assert_equal "Employee", response.parsed_body.dig("keka", "data", "employee_name")
  end
end
