require 'test_helper'

class ProjectModuleRegressionsTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: 'Project regressions', slug: 'project-regressions', kind: 'private')
    @owner = create_test_user(workspace: @workspace, email: 'module-owner@example.test')
    @member = create_test_user(workspace: @workspace, email: 'module-member@example.test')
    Current.workspace = @workspace
    Current.user = @owner
    @project = Project.create!(name: 'Private delivery', owner: @owner)
    @sprint = @project.sprints.create!(name: 'Current', start_date: Date.current, end_date: Date.current + 7)
    @task = @project.tasks.create!(task_id: 'REG-1', type: 'Code', developer: @owner, sprint: @sprint, title: 'Restricted task', order: 1)
    @second_task = @project.tasks.create!(task_id: 'REG-2', type: 'Code', developer: @owner, sprint: @sprint, title: 'Second task', order: 2)
    @vault = @project.project_vault_items.create!(title: 'Private credential', category: 'Credential', content: 'synthetic-only')
    Current.reset_all
    post '/api/login', params: { auth: { email: @member.email, password: 'Password!42' } }
    assert_response :success
  end

  test 'web and mobile lists hide nonmember projects tasks and sprints' do
    get '/api/projects'
    assert_response :success
    assert_empty response.parsed_body['data']
    get '/api/tasks'
    assert_response :success
    assert_empty response.parsed_body
    get '/api/sprints'
    assert_response :success
    assert_empty response.parsed_body
    token = mobile_token
    get "/api/v1/projects/#{@project.id}", headers: bearer(token)
    assert_response :not_found
    get '/api/v1/tasks', headers: bearer(token)
    assert_response :success
    assert_empty response.parsed_body['data']
    get "/api/v1/projects/#{@project.id}/sprints", headers: bearer(token)
    assert_response :not_found
    patch "/api/tasks/#{@task.id}", params: { task: { title: 'Injected' } }
    assert_response :not_found
    post '/api/tasks', params: { task: { project_id: @project.id, sprint_id: @sprint.id, task_id: 'BAD', type: 'Code', developer_id: @owner.id } }
    assert_response :not_found
    patch "/api/sprints/#{@sprint.id}", params: { sprint: { name: 'Injected' } }
    assert_response :not_found
    get '/api/search', params: { q: 'Restricted' }
    assert_empty response.parsed_body['results']
    token_record, = McpAccessToken.issue!(user: @member, name: 'regression')
    executor = Mcp::ToolExecutor.new(user: @member, token: token_record)
    assert_equal 0, executor.call('list_projects')[:count]
    assert_equal 0, executor.call('list_tasks')[:count]
    assert_equal 0, executor.call('list_sprints')[:count]
    assert_equal 0, executor.call('list_project_vault_items')[:count]
  end

  test 'invited removed and viewer memberships cannot change project records' do
    membership = ProjectUser.create!(workspace: @workspace, project: @project, user: @member, status: 'invited')
    %w[invited removed].each do |status|
      membership.update!(status: status)
      get "/api/projects/#{@project.id}/vault_items"
      assert_response :not_found
      patch "/api/tasks/#{@task.id}", params: { task: { status: 'completed' } }
      assert_response :not_found
    end
    membership.update!(status: 'active', role: 'viewer')
    get "/api/projects/#{@project.id}/vault_items"
    assert_response :success
    patch "/api/projects/#{@project.id}/vault_items/#{@vault.id}", params: { project_vault_item: { content: 'Changed' } }
    assert_response :forbidden
    patch "/api/tasks/#{@task.id}", params: { task: { status: 'completed' } }
    assert_response :forbidden
    patch "/api/v1/tasks/#{@task.id}", params: { task: { status: 'completed' } }, headers: bearer(mobile_token)
    assert_response :forbidden
    assert_equal 'forbidden', response.parsed_body.dig('error', 'code')
    patch "/api/sprints/#{@sprint.id}", params: { sprint: { name: 'Changed' } }
    assert_response :forbidden
    assert_equal 'synthetic-only', @vault.reload.content
  end

  test 'web and mobile reorder identical task groups and reject another project target' do
    ProjectUser.create!(workspace: @workspace, project: @project, user: @member, status: 'active')
    token = mobile_token
    patch "/api/v1/tasks/#{@second_task.id}", params: { task: { order: 1 } }, headers: bearer(token)
    assert_response :success
    assert_equal [2, 1], [@task.reload.order, @second_task.reload.order]
    patch "/api/tasks/#{@second_task.id}", params: { task: { order: 2 } }
    assert_response :success
    assert_equal [1, 2], [@task.reload.order, @second_task.reload.order]
    Current.workspace = @workspace
    foreign = Project.create!(name: 'Other private project', owner: @owner)
    foreign_sprint = foreign.sprints.create!(name: 'Other sprint', start_date: Date.current, end_date: Date.current + 7)
    Current.reset_all
    patch "/api/v1/tasks/#{@task.id}", params: { task: { project_id: foreign.id, sprint_id: foreign_sprint.id } }, headers: bearer(token)
    assert_response :not_found
    assert_equal @project.id, @task.reload.project_id
  end

  test 'momentum includes canonical inprogress tasks' do
    Current.workspace = @workspace
    Current.user = @member
    task = Task.create!(type: 'general', title: 'Canonical focus', assigned_user: @member, status: 'inprogress', created_by: @member.id)
    Current.reset_all
    get '/api/daily_momentum'
    assert_response :success
    assert_includes response.parsed_body.dig('morning_briefing', 'focus_tasks').map { |row| row['id'] }, task.id
  end

  test 'ICS import rolls back earlier events when a later event is invalid' do
    ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Valid\nDTSTART:20261010T100000Z\nDTEND:20261010T110000Z\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:Invalid\nDTSTART:20261010T110000Z\nDTEND:20261010T100000Z\nEND:VEVENT\nEND:VCALENDAR"
    assert_no_difference -> { CalendarEvent.unscoped.where(user_id: @member.id).count } do
      post '/api/calendar_events/import_ics', params: { ics: ics }
    end
    assert_response :unprocessable_entity
  end

  private

  def mobile_token
    post '/api/v1/auth/login', params: { auth: { email: @member.email, password: 'Password!42' } }
    assert_response :success
    response.parsed_body.dig('data', 'access_token')
  end

  def bearer(token)
    { 'Authorization' => "Bearer #{token}", 'Accept' => 'application/json' }
  end
end
