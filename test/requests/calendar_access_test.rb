require "test_helper"
class CalendarAccessTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Calendar access", slug: "calendar-access", kind: "private")
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: "calendar-viewer@example.test")
    @author = create_test_user(workspace: @workspace, email: "calendar-author@example.test")
    Current.user = @author
    @project = Project.create!(name: "Shared", owner: @author)
    @membership = @project.project_users.create!(user: @user, role: "viewer", status: "active")
    @event = @author.calendar_events.create!(title: "Shared meeting", project: @project, visibility: "project", event_type: "meeting", start_at: 1.day.from_now, end_at: 1.day.from_now + 1.hour)
    @reminder = @event.event_reminders.create!(channel: "email", minutes_before: 10)
    Current.reset_all
    post "/api/login", params: { auth: { email: @user.email, password: "Password!42" } }
    assert_response :success
  end
  test "invited and removed memberships cannot list export or access shared events and reminders" do
    %w[invited removed requested].each do |status|
      @membership.update!(status: status)
      get "/api/calendar_events"
      assert_response :success
      assert_empty response.parsed_body
      get "/api/calendar_events/export_ics"
      assert_response :success
      assert_not_includes response.body, "Shared meeting"
      get "/api/calendar_events/#{@event.id}/google_link"
      assert_response :not_found
      patch "/api/event_reminders/#{@reminder.id}", params: { event_reminder: { minutes_before: 30 } }
      assert_response :not_found
    end
  end
  test "viewers can read but cannot mutate shared events or reminders" do
    get "/api/calendar_events"
    assert_response :success
    assert_equal false, response.parsed_body.first["can_edit"]
    patch "/api/calendar_events/#{@event.id}", params: { calendar_event: { title: "Denied" } }
    assert_response :forbidden
    patch "/api/calendar_events/#{@event.id}/reschedule", params: { start_at: 2.days.from_now.iso8601, end_at: (2.days.from_now + 1.hour).iso8601 }
    assert_response :forbidden
    delete "/api/calendar_events/#{@event.id}"
    assert_response :forbidden
    post "/api/calendar_events/#{@event.id}/event_reminders", params: { event_reminder: { channel: "email", minutes_before: 30 } }
    assert_response :forbidden
    patch "/api/event_reminders/#{@reminder.id}", params: { event_reminder: { minutes_before: 30 } }
    assert_response :forbidden
    delete "/api/event_reminders/#{@reminder.id}"
    assert_response :forbidden
    assert_equal "Shared meeting", @event.reload.title
  end
  test "active editors can update shared events and personal creators can edit their own events" do
    @membership.update!(role: "developer")
    patch "/api/calendar_events/#{@event.id}", params: { calendar_event: { title: "Allowed" } }
    assert_response :success
    post "/api/calendar_events", params: { calendar_event: attributes }
    assert_response :created
    id = response.parsed_body["events"].first["id"]
    patch "/api/calendar_events/#{id}", params: { calendar_event: { title: "Personal changed" } }
    assert_response :success
  end
  test "linked records require access and must belong to the chosen project" do
    Current.workspace = @workspace
    Current.user = @author
    other_project = Project.create!(name: "Private", owner: @author)
    sprint = Sprint.create!(project: other_project, name: "Private sprint", start_date: Date.current, end_date: Date.current + 7)
    task = Task.create!(type: "general", title: "Private task", project: other_project, assigned_to_user: @author.id)
    Current.reset_all
    [{ project_id: other_project.id }, { task_id: task.id }, { sprint_id: sprint.id }, { project_id: @project.id, sprint_id: sprint.id }].each do |links|
      post "/api/calendar_events", params: { calendar_event: attributes.merge(links) }
      assert_response :unprocessable_entity
    end
    @membership.update!(role: "developer")
    patch "/api/calendar_events/#{@event.id}", params: { calendar_event: { task_id: task.id } }
    assert_response :unprocessable_entity
  end
  def attributes
    { title: "Personal", event_type: "meeting", visibility: "personal", start_at: 3.days.from_now.iso8601, end_at: (3.days.from_now + 1.hour).iso8601 }
  end
end
