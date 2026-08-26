require "test_helper"

class TaskLogsTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Task Logs", slug: "task-logs", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "task-logs-owner@example.test")
    @developer = create_test_user(workspace: @workspace, email: "task-logs-dev@example.test")
    @second_developer = create_test_user(workspace: @workspace, email: "task-logs-second-dev@example.test")
    Current.user = @user
    Current.workspace = @workspace

    @project = Project.create!(name: "Scheduler", owner: @user)
    @sprint = @project.sprints.create!(name: "Sprint 1", start_date: Date.new(2026, 6, 1), end_date: Date.new(2026, 6, 5))
    @other_sprint = @project.sprints.create!(name: "Sprint 2", start_date: Date.new(2026, 6, 8), end_date: Date.new(2026, 6, 12))

    @first_task = @project.tasks.create!(
      sprint: @sprint,
      task_id: "TASK-2",
      title: "First in sprint order",
      type: "Code",
      developer: @developer,
      order: 1
    )
    @second_task = @project.tasks.create!(
      sprint: @sprint,
      task_id: "TASK-1",
      title: "Second in sprint order",
      type: "Code",
      developer: @developer,
      order: 2
    )
    @other_task = @project.tasks.create!(
      sprint: @other_sprint,
      task_id: "TASK-3",
      title: "Other sprint",
      type: "Code",
      developer: @developer,
      order: 1
    )

    @second_log = TaskLog.create!(task: @second_task, developer: @developer, log_date: Date.new(2026, 6, 1), type: "Code", hours_logged: 1)
    @first_log = TaskLog.create!(task: @first_task, developer: @developer, log_date: Date.new(2026, 6, 1), type: "Code", hours_logged: 1)
    @other_log = TaskLog.create!(task: @other_task, developer: @developer, log_date: Date.new(2026, 6, 8), type: "Code", hours_logged: 1)

    Current.reset_all
    login_as(@user)
  end

  test "index returns sprint logs in task order instead of task key order" do
    get "/api/task_logs.json", params: { sprint_id: @sprint.id }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal [@first_log.id, @second_log.id], payload.map { |log| log["id"] }
    assert_equal ["TASK-2", "TASK-1"], payload.map { |log| log.dig("task", "task_id") }
  end

  test "destroy_for_sprint deletes only logs for the requested sprint" do
    assert_difference -> { TaskLog.unscoped.where(task_id: [@first_task.id, @second_task.id]).count }, -2 do
      assert_no_difference -> { TaskLog.unscoped.where(task_id: @other_task.id).count } do
        delete "/api/task_logs/destroy_for_sprint.json", params: { sprint_id: @sprint.id }
      end
    end

    assert_response :success
    assert_equal({ "deleted_count" => 2 }, JSON.parse(response.body))
    assert TaskLog.unscoped.exists?(@other_log.id)
  end

  test "update moves a log to the dropped date and developer" do
    patch "/api/task_logs/#{@first_log.id}.json", params: {
      task_log: {
        log_date: "2026-06-03",
        developer_id: @second_developer.id
      }
    }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "2026-06-03", payload["log_date"]
    assert_equal @second_developer.id, payload["developer_id"]
    assert_equal @second_developer.id, payload.dig("developer", "id")
    assert_equal Date.new(2026, 6, 3), @first_log.reload.log_date
  end

  private

  def login_as(user)
    post "/api/login", params: {
      auth: { email: user.email, password: "Password!42" }
    }
    assert_response :success
  end
end
