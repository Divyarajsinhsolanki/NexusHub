require "test_helper"

class HomePreferencesTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Shortcuts", slug: "home-shortcuts", kind: "private")
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: "shortcuts@example.test")
    @other = create_test_user(workspace: @workspace, email: "other-shortcuts@example.test")
    post "/api/login", params: { auth: { email: @user.email, password: "Password!42" } }
    assert_response :success
  end

  test "preferences persist across sessions and only affect the signed in user" do
    post "/api/update_profile", params: { auth: { home_preferences: { show_shortcuts: false, shortcut_ids: ["projects", "chat", "projects", "unknown"] } } }, as: :json
    assert_response :success
    assert_equal false, @user.reload.home_preferences["show_shortcuts"]
    assert_equal ["projects", "chat"], @user.home_preferences["shortcut_ids"]
    assert_equal %w[chat knowledge pdf-master], @other.reload.home_preferences["shortcut_ids"]
    post "/api/login", params: { auth: { email: @user.email, password: "Password!42" } }
    assert_response :success
    assert_equal @user.home_preferences, response.parsed_body.dig("user", "home_preferences")
  end

  test "an empty link selection is preserved and unrelated profile saves keep preferences" do
    post "/api/update_profile", params: { auth: { home_preferences: { show_shortcuts: true, shortcut_ids: [] } } }, as: :json
    assert_response :success
    assert_empty @user.reload.home_preferences["shortcut_ids"]
    post "/api/update_profile", params: { auth: { dark_mode: true } }, as: :json
    assert_response :success
    assert_empty @user.reload.home_preferences["shortcut_ids"]
  end
  test "all card visibility flags persist and update response matches the session" do
    preferences = { show_shortcuts: false, show_overview: false, show_due_tasks: false, show_tasks: false, show_projects: false, show_birthdays: false, card_order: %w[show_projects show_tasks show_overview show_shortcuts show_due_tasks show_birthdays], shortcut_ids: ["projects", "chat"] }
    post "/api/update_profile", params: { auth: { home_preferences: preferences } }, as: :json
    assert_response :success
    saved = response.parsed_body["home_preferences"]
    assert_equal preferences.stringify_keys, saved
    get "/api/session"
    assert_response :success
    assert_equal saved, response.parsed_body.dig("user", "home_preferences")
  end

  test "card order keeps valid unique choices and restores omitted cards" do
    post "/api/update_profile", params: { auth: { home_preferences: { card_order: ["show_projects", "unknown", "show_projects", "show_tasks"] } } }, as: :json
    assert_response :success
    assert_equal %w[show_projects show_tasks show_overview show_shortcuts show_due_tasks show_birthdays], @user.reload.home_preferences["card_order"]
  end

end
