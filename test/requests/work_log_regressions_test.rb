require 'test_helper'

class WorkLogRegressionsTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: 'Work log regressions', slug: 'work-log-regressions', kind: 'private')
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: 'work-log-regressions@example.test')
    @log = @user.work_logs.create!(title: 'Original', log_date: Date.current, start_time: '09:00', end_time: '10:00')
    @tag = WorkTag.create!(name: 'original')
    @log.tags = [@tag]
    Current.reset_all
    post '/api/login', params: { auth: { email: @user.email, password: 'Password!42' } }
    assert_response :success
    post '/api/v1/auth/login', params: { auth: { email: @user.email, password: 'Password!42', device_name: 'Regression tests' } }
    assert_response :success
    @headers = { 'Authorization' => "Bearer #{response.parsed_body.dig('data', 'access_token')}" }
  end

  %w[web mobile].each do |client|
    test "#{client} partial updates preserve tags and explicit empty tags clear them" do
      patch "#{path(client)}/#{@log.id}", params: { work_log: { actual_minutes: 15 } }, headers: headers(client), as: :json
      assert_response :success
      assert_equal [@tag.id], tag_ids
      patch "#{path(client)}/#{@log.id}", params: { work_log: { tags: [] } }, headers: headers(client), as: :json
      assert_response :success
      assert_empty tag_ids
    end

    test "#{client} invalid edits preserve attributes and tags without creating orphan tags" do
      assert_no_difference 'WorkTag.unscoped.count' do
        patch "#{path(client)}/#{@log.id}", params: { work_log: { title: '', tags: ['replacement'] } }, headers: headers(client), as: :json
        assert_response :unprocessable_entity
      end
      assert_equal 'Original', @log.reload.title
      assert_equal [@tag.id], tag_ids
    end

    test "#{client} successful edits normalize tag names" do
      patch "#{path(client)}/#{@log.id}", params: { work_log: { tags: [' focus ', 'focus', ''] } }, headers: headers(client), as: :json
      assert_response :success
      assert_equal ['focus'], WorkTag.unscoped.where(id: tag_ids).pluck(:name)
    end

    test "#{client} accepts overnight logs but rejects zero duration logs" do
      attributes = { title: 'Night work', log_date: Date.current, start_time: '23:00', end_time: '01:00', tags: ['night'] }
      post path(client), params: { work_log: attributes }, headers: headers(client), as: :json
      assert_response :created
      assert_equal '23:00', WorkLog.unscoped.find_by!(title: 'Night work').start_time.strftime('%H:%M')
      assert_equal 120, WorkLog.unscoped.find_by!(title: 'Night work').planned_minutes
      assert_no_difference ['WorkLog.unscoped.count', 'WorkTag.unscoped.count'] do
        post path(client), params: { work_log: attributes.merge(end_time: '23:00', tags: ['invalid-night']) }, headers: headers(client), as: :json
        assert_response :unprocessable_entity
      end
    end
  end

  def path(client)
    client == 'mobile' ? '/api/v1/work_logs' : '/api/work_logs'
  end

  def tag_ids
    WorkLogTag.unscoped.where(work_log_id: @log.id).pluck(:work_tag_id)
  end

  def headers(client)
    client == 'mobile' ? @headers : {}
  end
end
