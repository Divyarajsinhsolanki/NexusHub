require 'test_helper'

class OperationsIntegrationTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper
  setup do
    @workspace = Workspace.create!(name: 'Operations integrations', slug: 'operations-integrations', kind: 'private')
    @user = create_test_user(workspace: @workspace, email: 'operations-integrations@example.test')
    Current.workspace = @workspace
    @project = Project.create!(name: 'Integration project', owner: @user)
    @membership = ProjectUser.create!(project: @project, user: @user, role: 'developer', status: 'active')
    @environment = ProjectEnvironment.create!(project: @project, name: 'Production')
    @license = ProjectOperationItem.create!(project: @project, kind: 'license', name: 'Support contract', details: {
      'owner_id' => @user.id, 'time_zone' => 'Asia/Kolkata', 'expiry_date' => 40.days.from_now.to_date.iso8601
    })
    Operations::Schedules.sync_item!(@license)
    @event = CalendarEvent.find_by!(operation_source: @license)
    Current.reset_all
    post '/api/login', params: { auth: { email: @user.email, password: 'Password!42' } }
    assert_response :success
  end

  test 'legacy environment creation is audited and preserves its response shape' do
    post "/api/projects/#{@project.id}/environments", params: { project_environment: { name: 'Staging' } }
    assert_response :created
    assert_equal 'Staging', response.parsed_body['name']
    in_workspace do
      assert_equal 1, @project.reload.operations_revision
      assert_equal 'Staging', @project.project_operation_changes.last.environment_name
    end
    @membership.update!(role: 'viewer')
    patch "/api/projects/#{@project.id}/environments/#{@environment.id}", params: { project_environment: { name: 'Denied' } }
    assert_response :forbidden
    @membership.update!(status: 'removed')
    get "/api/projects/#{@project.id}/environments"
    assert_response :not_found
  end

  test 'an environment referenced by configuration cannot be deleted through the vault endpoint' do
    in_workspace do
      item = ProjectOperationItem.create!(project: @project, kind: 'configuration', name: 'API_URL')
      item.entries.create!(project: @project, project_environment: @environment, required: true)
    end
    delete "/api/projects/#{@project.id}/environments/#{@environment.id}"
    assert_response :unprocessable_entity
    assert_includes response.parsed_body['error'], 'reassign'
  end

  test 'managed calendar records open the operations detail and cannot bypass mutation policy' do
    get '/api/calendar_events', params: { project_id: @project.id }
    assert_response :success
    event = response.parsed_body.find { |row| row['id'] == @event.id }
    assert event['managed_operation']
    assert_equal "/projects/#{@project.id}/dashboard?tab=environments&section=licenses&record=#{@license.id}", event['operation_path']
    patch "/api/calendar_events/#{@event.id}", params: { calendar_event: { title: 'Bypass' } }
    assert_response :unprocessable_entity
    post "/api/calendar_events/#{@event.id}/event_reminders", params: { event_reminder: { channel: 'email', minutes_before: 5 } }
    assert_response :unprocessable_entity
    delete "/api/calendar_events/#{@event.id}"
    assert_response :unprocessable_entity
    @membership.update!(status: 'removed')
    get '/api/calendar_events', params: { project_id: @project.id }
    assert_response :success
    assert_empty response.parsed_body
  end

  test 'generic administration cannot expose protected records or mutate managed calendar events' do
    in_workspace { UserRole.create!(user: @user, role: Role.find_by!(name: 'owner')) }
    get '/api/admin/tables'
    assert_response :success
    %w[ProjectEnvironment ProjectOperationItem ProjectOperationEntry ProjectOperationChange ProjectDeployment ProjectDeploymentSeries OperationReminderDelivery].each do |name|
      assert_not_includes response.parsed_body, name
      get "/api/admin/#{name}"
      assert_response :unprocessable_entity
    end
    patch "/api/admin/CalendarEvent/#{@event.id}", params: { record: { title: 'Bypass' } }
    assert_response :not_found
    post '/api/admin/EventReminder', params: { record: { calendar_event_id: @event.id, channel: 'email', minutes_before: 5 } }
    assert_response :unprocessable_entity
    patch "/api/admin/Project/#{@project.id}", params: { record: { operations_revision: 99 } }
    assert_response :success
    in_workspace { assert_equal 0, @project.reload.operations_revision }
  end

  test 'activity omits managed events after membership removal but preserves ordinary personal events' do
    ordinary = nil
    other_event = nil
    in_workspace do
      @license.update!(details: @license.details.merge('expiry_date' => 2.days.from_now.to_date.iso8601))
      Operations::Schedules.sync_item!(@license)
      other = create_test_user(workspace: @workspace, email: 'operations-other-owner@example.test')
      ProjectUser.create!(project: @project, user: other, role: 'developer', status: 'active')
      deployment = ProjectDeployment.create!(project: @project, project_environment: @environment, owner: other,
        name: 'Shared upcoming deployment', scheduled_at: 3.days.from_now, time_zone: 'Asia/Kolkata')
      Operations::Schedules.sync_deployment!(deployment)
      other_event = CalendarEvent.find_by!(operation_source: deployment)
      ordinary = CalendarEvent.create!(user: @user, title: 'Personal planning', start_at: 1.day.from_now,
        end_at: 1.day.from_now + 1.hour, event_type: 'meeting')
    end

    get '/api/activity'
    assert_response :success
    event_ids = response.parsed_body['items'].select { |row| row['kind'] == 'event' }.map { |row| row['id'] }
    assert_includes event_ids, @event.id
    assert_includes event_ids, other_event.id
    assert_equal 3, response.parsed_body['summary']['upcoming_events']

    @membership.update!(status: 'removed')
    get '/api/activity'
    assert_response :success
    event_ids = response.parsed_body['items'].select { |row| row['kind'] == 'event' }.map { |row| row['id'] }
    assert_not_includes event_ids, @event.id
    assert_not_includes event_ids, other_event.id
    assert_includes event_ids, ordinary.id
    assert_equal 1, response.parsed_body['summary']['upcoming_events']
  end

  test 'MCP environment and calendar paths retain project membership and managed-record protection' do
    in_workspace do
      token, = McpAccessToken.issue!(user: @user, name: 'operations test')
      executor = Mcp::ToolExecutor.new(user: @user, token: token)
      assert_equal 1, executor.call('list_project_environments', { project_id: @project.id })[:count]
      assert_raises(Mcp::ToolExecutor::ToolError) do
        executor.call('update_calendar_event', { id: @event.id, title: 'Bypass' })
      end
      @membership.update!(status: 'removed')
      assert_equal 0, executor.call('list_project_environments', { project_id: @project.id })[:count]
      assert_empty executor.call('get_project', { project_id: @project.id })[:project][:environments]
    end
  end

  test 'operations reminders use the reminder filter and a direct safe link with mobile push' do
    in_workspace do
      assert_enqueued_jobs 1, only: PushNotificationDispatchJob do
        Notification.create!(recipient: @user, actor: @user, action: 'operations_reminder', notifiable: @license,
          metadata: { title: @license.name, project_id: @project.id, kind: 'license', path: Operations::Schedules.path_for(@license) })
      end
    end
    get '/api/notifications', params: { action_type: 'calendar_reminder' }
    assert_response :success
    notice = response.parsed_body['notifications'].find { |row| row['action'] == 'operations_reminder' }
    assert_equal 'reminders', notice['category']
    assert_includes notice['deep_link'], '/dashboard?tab=environments'
  end

  test 'deleting a project removes managed licence calendar records and reminder deliveries' do
    in_workspace do
      @project.destroy!
      assert_not CalendarEvent.exists?(@event.id)
      assert_not OperationReminderDelivery.where(project_id: @project.id).exists?
    end
  end

  test 'user and generic admin deletion report operational ownership restrictions without deleting records' do
    in_workspace { UserRole.create!(user: @user, role: Role.find_by!(name: 'owner')) }

    ["/api/users/#{@user.id}", "/api/admin/User/#{@user.id}"].each do |path|
      delete path
      assert_response :unprocessable_entity
      assert_includes response.parsed_body.fetch('errors').join, 'Reassign operational ownership'
      assert User.exists?(@user.id)
      in_workspace do
        assert ProjectUser.exists?(@membership.id)
        assert ProjectOperationItem.exists?(@license.id)
        assert CalendarEvent.exists?(@event.id)
      end
    end
  end

  private

  def in_workspace(&block)
    Current.set(workspace: @workspace, user: @user, &block)
  end
end
