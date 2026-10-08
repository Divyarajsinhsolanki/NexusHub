require "test_helper"

class SearchAndActivityTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Search Workspace", slug: "search-workspace", kind: "private")
    @foreign_workspace = Workspace.create!(name: "Foreign Workspace", slug: "foreign-workspace", kind: "private")
    @user = create_user(@workspace, "searcher@example.test")
    foreign_user = create_user(@foreign_workspace, "foreign@example.test")

    @project = Project.create!(workspace: @workspace, name: "Orion Delivery", description: "Visible workspace project", owner: @user)
    foreign_project = Project.create!(workspace: @foreign_workspace, name: "Orion Foreign", description: "Must stay hidden")
    Task.create!(
      workspace: @workspace,
      project: @project,
      assigned_user: @user,
      type: "general",
      title: "Orion assignment",
      status: "todo",
      created_by: @user.id,
      end_date: Date.current + 2.days
    )
    Task.create!(
      workspace: @foreign_workspace,
      project: foreign_project,
      assigned_user: foreign_user,
      type: "general",
      title: "Orion foreign assignment",
      status: "todo"
    )
    CalendarEvent.create!(
      workspace: @workspace,
      user: @user,
      title: "Orion planning",
      start_at: 1.day.from_now,
      end_at: 1.day.from_now + 30.minutes,
      event_type: "meeting",
      visibility: "personal",
      status: "scheduled"
    )
    Post.create!(workspace: @workspace, user: @user, message: "Orion release update")
    Post.create!(workspace: @foreign_workspace, user: foreign_user, message: "Orion foreign update")
    login(@user)
  end

  test "global search returns only current workspace records" do
    get "/api/search", params: { q: "Orion" }

    assert_response :success
    results = JSON.parse(response.body).fetch("results")
    titles = results.map { |result| result.fetch("title") }
    assert_includes titles, "Orion Delivery"
    assert_includes titles, "Orion assignment"
    assert_not titles.any? { |title| title.include?("Foreign") || title.include?("foreign") }
  end

  test "activity combines assignments and calendar without foreign records" do
    get "/api/activity"

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal 1, payload.dig("summary", "open_assignments")
    assert_equal 1, payload.dig("summary", "upcoming_events")
    titles = payload.fetch("items").map { |item| item.fetch("title") }
    assert_includes titles, "Orion assignment"
    assert_includes titles, "Orion planning"
    assert_not titles.any? { |title| title.include?("Foreign") || title.include?("foreign") }
  end

  private

  def create_user(workspace, email)
    workspace.users.create!(
      email: email,
      password: "Password!42",
      password_confirmation: "Password!42",
      first_name: "Test",
      last_name: "User",
      job_title: "Engineer",
      status: "active",
      confirmed_at: Time.current
    )
  end

  def login(user)
    post "/api/login", params: { auth: { email: user.email, password: "Password!42" } }
    assert_response :success
  end
end
