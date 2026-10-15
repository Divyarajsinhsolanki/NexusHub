require "test_helper"

class MobileHomeTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Home filters", slug: "home-filters", kind: "private")
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: "home-filters@example.test")
    @user.roles = [Role.find_by!(name: "member")]
    session, = MobileSession.issue_for!(user: @user)
    @headers = { "Authorization" => "Bearer #{MobileAccessToken.issue(session)[:token]}" }
  end

  test "filters the complete assigned task set before the five task limit" do
    today = Date.current
    6.times { |i| task("Old #{i}", today - 10 + i) }
    due = task("Due today", today)
    undated = task("No date", nil)
    task("Tomorrow", today + 1)
    task("Completed", today - 1, status: "completed")
    task("Done", today, status: "done")
    get "/api/v1/home", headers: @headers
    assert_response :success
    original = response.parsed_body.fetch("data")
    assert_equal 5, original["tasks"].size
    assert_equal 9, original.dig("summary", "open_tasks")
    assert_equal 6, original.dig("summary", "overdue_tasks")
    assert_equal 1, original.dig("summary", "due_today")
    get "/api/v1/home", params: { task_filter: "due_today" }, headers: @headers
    assert_response :success
    payload = response.parsed_body.fetch("data")
    assert_equal [due.id], payload["tasks"].map { |row| row["id"] }
    assert_equal original["summary"], payload["summary"]
    get "/api/v1/home", params: { task_filter: "overdue" }, headers: @headers
    assert_equal 5, response.parsed_body.dig("data", "tasks").size
    assert_not_includes response.parsed_body.dig("data", "tasks").map { |row| row["id"] }, undated.id
  end

  test "uses Rails current date across midnight and keeps undated tasks in all open only" do
    travel_to Time.zone.local(2026, 10, 16, 23, 59) do
      session, = MobileSession.issue_for!(user: @user)
      @headers = { "Authorization" => "Bearer #{MobileAccessToken.issue(session)[:token]}" }
      task("Boundary", Date.current)
      undated = task("Undated", nil)
      get "/api/v1/home", params: { task_filter: "due_today" }, headers: @headers
      assert_equal "2026-10-16", response.parsed_body.dig("data", "as_of_date")
      assert_equal 1, response.parsed_body.dig("data", "tasks").size
      travel 2.minutes
      get "/api/v1/home", params: { task_filter: "overdue" }, headers: @headers
      assert_equal "2026-10-17", response.parsed_body.dig("data", "as_of_date")
      assert_equal 1, response.parsed_body.dig("data", "summary", "overdue_tasks")
      get "/api/v1/home", headers: @headers
      assert_includes response.parsed_body.dig("data", "tasks").map { |row| row["id"] }, undated.id
    end
  end

  test "excludes other users and other workspaces and rejects invalid filters" do
    own = task("Own", Date.current)
    colleague = create_test_user(workspace: @workspace, email: "home-colleague@example.test")
    task("Colleague", Date.current, owner: colleague)
    other = Workspace.create!(name: "Foreign home", slug: "foreign-home", kind: "private")
    Current.set(workspace: other) do
      foreign = create_test_user(workspace: other, email: "foreign-home@example.test")
      task("Foreign", Date.current, owner: foreign)
    end
    %w[all_open due_today overdue].each do |filter|
      get "/api/v1/home", params: { task_filter: filter }, headers: @headers
      assert_response :success
      assert_equal 1, response.parsed_body.dig("data", "summary", "open_tasks")
      assert_equal(filter == "overdue" ? [] : [own.id], response.parsed_body.dig("data", "tasks").map { |row| row["id"] })
    end
    get "/api/v1/home", params: { task_filter: "anything" }, headers: @headers
    assert_response :unprocessable_entity
    assert_equal "invalid_task_filter", response.parsed_body.dig("error", "code")
  end

  private

  def task(title, date, status: "todo", owner: @user)
    Task.create!(workspace: owner.workspace, title: title, type: "general", status: status, end_date: date, assigned_user: owner, created_by: owner.id)
  end
end
