require 'test_helper'

class ProjectDeploymentsRequestTest < ActionDispatch::IntegrationTest
  setup do
    travel_to Time.utc(2026, 10, 8, 6)
    @workspace = Workspace.create!(name: 'Deployments API', slug: 'deployments-api', kind: 'private')
    @user = create_test_user(workspace: @workspace, email: 'deployments-api@example.test')
    Current.workspace = @workspace
    @project = Project.create!(name: 'Deployments API project', owner: @user)
    @membership = ProjectUser.create!(project: @project, user: @user, role: 'developer', status: 'active')
    @environment = ProjectEnvironment.create!(project: @project, name: 'Production')
    @software = ProjectOperationItem.create!(project: @project, name: 'Ruby', kind: 'software')
    @baseline = @software.entries.create!(project: @project, project_environment: @environment, expected_version: '3.3.12', source: 'manual')
    Current.reset_all
    post '/api/login', params: { auth: { email: @user.email, password: 'Password!42' } }
    assert_response :success
  end

  teardown { travel_back }

  test 'create and edit are revision guarded and history identifies the deployment' do
    create_deployment
    record = response.parsed_body['deployments'].first
    assert_equal '3.3.12', record['targets'].first['expected_version']
    get endpoint
    assert_response :success
    assert_equal 'no-store', response.headers['Cache-Control']
    id = record['id']
    patch "#{endpoint}/#{id}", params: { revision: 0, deployment: { name: 'Stale edit' } }, as: :json
    assert_response :conflict
    assert_equal 1, response.parsed_body['revision']
    patch "#{endpoint}/#{id}", params: { revision: 1, deployment: { name: 'Next release' } }, as: :json
    assert_response :success
    Current.workspace = @workspace
    assert_equal 'Next release', ProjectDeployment.find(id).name
    assert_equal id, ProjectOperationChange.order(:id).last.metadata['deployment_id']
    assert_equal 'Next release', ProjectOperationChange.order(:id).last.item_name
    assert_equal 'Production', ProjectOperationChange.order(:id).last.environment_name
  end

  test 'recorded deployment completion then reviewed CSV observations permits verification' do
    create_deployment(targets: [{ item_id: @software.id, expected_version: '3.4.0' }])
    id = response.parsed_body['deployments'].first['id']
    transition(id, 'in_progress')
    patch "#{endpoint}/#{id}", params: { revision: revision, deployment: { name: 'Frozen change' } }, as: :json
    assert_response :unprocessable_entity
    transition(id, 'deployed')
    content = "name,observed_version\nRuby,3.4.0\n"
    before_revision = revision
    post "#{endpoint}/#{id}/observations", params: { content: content, preview: true }, as: :json
    assert_response :success
    assert_equal before_revision, response.parsed_body['revision']
    assert_equal '3.4.0', response.parsed_body['rows'].first['observed_version']
    post "#{endpoint}/#{id}/verify", params: { revision: revision }, as: :json
    assert_response :unprocessable_entity
    post "#{endpoint}/#{id}/observations", params: { revision: revision, content: content, selected_item_ids: [@software.id] }, as: :json
    assert_response :success
    assert_equal 'match', response.parsed_body['deployments'].first['verification'].first['status']
    post "#{endpoint}/#{id}/verify", params: { revision: revision }, as: :json
    assert_response :success
    assert_equal 'verified', response.parsed_body['deployments'].first['verification_status']
    Current.workspace = @workspace
    assert_equal '3.4.0', @baseline.reload.expected_version
    assert_equal @user.id, @baseline.verified_by_id
  end

  test 'bad CSV and stale commits leave observations and revisions unchanged' do
    create_deployment
    id = response.parsed_body['deployments'].first['id']
    transition(id, 'in_progress')
    transition(id, 'deployed')
    before_revision = revision
    post "#{endpoint}/#{id}/observations", params: { revision: before_revision, content: "name,observed_version\nForeign,private-input", selected_item_ids: [@software.id] }, as: :json
    assert_response :unprocessable_entity
    assert_not_includes response.body, 'private-input'
    post "#{endpoint}/#{id}/observations", params: { revision: before_revision - 1, observations: [{ item_id: @software.id, observed_version: '3.3.12' }] }, as: :json
    assert_response :conflict
    Current.workspace = @workspace
    assert_empty ProjectDeployment.find(id).observations
    assert_equal before_revision, revision
  end

  test 'recurring edits update future planned occurrences and preserve started and completed releases' do
    post series_endpoint, params: { revision: 0, series: {
      name: 'Friday release', project_environment_id: @environment.id, time_zone: 'Asia/Kolkata',
      frequency: 'weekly', local_time: '18:00', starts_on: '2026-10-08', weekdays: [5]
    } }, as: :json
    assert_response :created
    body = response.parsed_body
    series_id = body['series'].first['id']
    first_id = body['deployments'].min_by { |row| row['scheduled_at'] }['id']
    transition(first_id, 'in_progress')
    patch "#{series_endpoint}/#{series_id}", params: { revision: revision, series: { name: 'Friday revised', local_time: '19:30' } }, as: :json
    assert_response :success
    rows = response.parsed_body['deployments']
    assert_equal 'Friday release', rows.find { |row| row['id'] == first_id }['name']
    assert rows.reject { |row| row['id'] == first_id }.all? { |row| row['name'] == 'Friday revised' && Time.iso8601(row['scheduled_at']).utc.hour == 14 }
    delete "#{series_endpoint}/#{series_id}", params: { revision: revision }, as: :json
    assert_response :success
    rows = response.parsed_body['deployments']
    assert_equal 'in_progress', rows.find { |row| row['id'] == first_id }['status']
    assert rows.reject { |row| row['id'] == first_id }.all? { |row| row['status'] == 'cancelled' }
    assert_not response.parsed_body['series'].first['active']
  end

  test 'viewers can inspect but cannot change schedules or preview imports and removed members cannot inspect' do
    @membership.update!(role: 'viewer')
    get endpoint
    assert_response :success
    post endpoint, params: { revision: 0, deployment: deployment_attributes }, as: :json
    assert_response :forbidden
    post "#{endpoint}/123/observations", params: { preview: true, content: 'name,observed_version' }, as: :json
    assert_response :forbidden
    @membership.update!(status: 'removed')
    get endpoint
    assert_response :not_found
  end

  test 'restoring series weekdays recreates superseded dates but preserves explicitly cancelled occurrences' do
    post series_endpoint, params: { revision: revision, series: {
      name: 'Friday release', project_environment_id: @environment.id, time_zone: 'Asia/Kolkata',
      frequency: 'weekly', local_time: '18:00', starts_on: '2026-10-08', weekdays: [5]
    } }, as: :json
    assert_response :created
    original = response.parsed_body['deployments'].sort_by { |row| row['scheduled_at'] }
    series_id = response.parsed_body['series'].first['id']
    manually_cancelled = original.first
    delete "#{endpoint}/#{manually_cancelled['id']}", params: { revision: revision }, as: :json
    assert_response :success

    patch "#{series_endpoint}/#{series_id}", params: { revision: revision, series: { weekdays: [1] } }, as: :json
    assert_response :success
    assert response.parsed_body['deployments'].select { |row| row['status'] == 'planned' }.all? { |row| Time.iso8601(row['scheduled_at']).wday == 1 }

    patch "#{series_endpoint}/#{series_id}", params: { revision: revision, series: { weekdays: [5] } }, as: :json
    assert_response :success
    rows = response.parsed_body['deployments']
    planned_dates = rows.select { |row| row['status'] == 'planned' }.map { |row| row['scheduled_at'] }.sort
    assert_equal original.drop(1).map { |row| row['scheduled_at'] }.sort, planned_dates
    assert_equal original.length, rows.count { |row| original.map { |entry| entry['id'] }.include?(row['id']) && row['status'] == 'cancelled' }
    assert_equal 'cancelled', rows.find { |row| row['id'] == manually_cancelled['id'] }['status']
  end

  test 'cross-project environments targets and foreign projects cannot be used' do
    Current.workspace = @workspace
    other = Project.create!(name: 'Different project')
    other_env = ProjectEnvironment.create!(project: other, name: 'Production')
    post endpoint, params: { revision: 0, deployment: deployment_attributes.merge(project_environment_id: other_env.id) }, as: :json
    assert_response :unprocessable_entity
    assert_equal 0, revision
    foreign = Workspace.create!(name: 'Foreign release workspace', slug: 'foreign-release-workspace', kind: 'private')
    foreign_project = Project.create!(workspace: foreign, name: 'Foreign release')
    get "/api/projects/#{foreign_project.id}/operations/deployments"
    assert_response :not_found
  end

  private

  def endpoint
    "/api/projects/#{@project.id}/operations/deployments"
  end

  def series_endpoint
    "/api/projects/#{@project.id}/operations/deployment_series"
  end

  def revision
    Project.unscoped.find(@project.id).operations_revision
  end

  def deployment_attributes
    { name: 'Release 1.0', project_environment_id: @environment.id, scheduled_at: 3.days.from_now.iso8601, time_zone: 'Asia/Kolkata' }
  end

  def create_deployment(**attrs)
    post endpoint, params: { revision: revision, deployment: deployment_attributes.merge(attrs) }, as: :json
    assert_response :created
  end

  def transition(id, status)
    post "#{endpoint}/#{id}/transition", params: { revision: revision, status: status }, as: :json
    assert_response :success
  end
end
