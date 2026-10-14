require 'test_helper'

class CallHistoryTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: 'History', slug: 'call-history', kind: 'private')
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: 'history@example.test')
    @other = create_test_user(workspace: @workspace, email: 'other-history@example.test')
    @outsider = create_test_user(workspace: @workspace, email: 'outsider-history@example.test')
    @conversation = Conversation.create!(workspace: @workspace, creator: @user, conversation_type: 'direct')
    [@user, @other].each { |user| @conversation.conversation_participants.create!(workspace: @workspace, user: user) }
    @call = @conversation.call_sessions.create!(workspace: @workspace, initiator: @user, call_type: 'video', status: 'ended', livekit_room_name: 'history-room', started_at: 10.minutes.ago, ended_at: 5.minutes.ago)
    @call.call_participants.create!(workspace: @workspace, user: @user, status: 'left', joined_at: @call.started_at, left_at: @call.ended_at)
    @call.call_participants.create!(workspace: @workspace, user: @other, status: 'missed')
  end

  test 'returns connected duration and callback metadata through web and mobile' do
    login(@user)
    get '/api/calls', params: { page: 1, per_page: 1 }
    assert_response :success
    row = JSON.parse(response.body).fetch('data').first
    assert_equal 300, row.fetch('duration_seconds')
    assert_equal 'outgoing', row.fetch('direction')
    assert_equal true, row.fetch('can_callback')
    assert_equal 'video', row.fetch('call_type')
    session, = MobileSession.issue_for!(user: @user)
    get '/api/v1/calls', headers: { 'Authorization' => "Bearer #{MobileAccessToken.issue(session)[:token]}" }
    assert_response :success
    assert_equal @call.id, JSON.parse(response.body).fetch('data').first.fetch('id')
    login(@other)
    get '/api/calls'
    row = JSON.parse(response.body).fetch('data').first
    assert_equal 0, row.fetch('duration_seconds')
    assert_equal 'incoming', row.fetch('direction')
  end

  test 'does not expose other users or another workspace and requires authentication' do
    get '/api/v1/calls'
    assert_response :unauthorized
    login(@outsider)
    get '/api/calls'
    assert_response :success
    assert_empty JSON.parse(response.body).fetch('data')
    external = Workspace.create!(name: 'External history', slug: 'external-history', kind: 'private')
    Current.workspace = external
    external_user = create_test_user(workspace: external, email: 'external-history@example.test')
    login(external_user)
    get '/api/calls'
    assert_response :success
    assert_empty JSON.parse(response.body).fetch('data')
  end

  test 'revoked membership and live calls disable callback' do
    login(@user)
    live = @conversation.call_sessions.create!(workspace: @workspace, initiator: @user, call_type: 'audio', status: 'ringing', livekit_room_name: 'history-live')
    get '/api/calls'
    assert_equal false, JSON.parse(response.body).fetch('data').first.fetch('can_callback')
    live.update!(status: 'ended')
    @conversation.conversation_participants.find_by!(user_id: @user.id).destroy!
    get '/api/calls'
    row = JSON.parse(response.body).fetch('data').first
    assert_equal false, row.fetch('can_callback')
    assert_equal false, row.fetch('can_open_conversation')
    post "/api/conversations/#{@conversation.id}/calls", params: { call_type: 'video' }
    assert_response :not_found
  end

  test 'paginates deterministically without duplicating calls' do
    second = @conversation.call_sessions.create!(workspace: @workspace, initiator: @user, call_type: 'audio', status: 'missed', livekit_room_name: 'history-second')
    second.call_participants.create!(workspace: @workspace, user: @user, status: 'missed')
    login(@user)
    get '/api/calls', params: { per_page: 1 }
    first = JSON.parse(response.body)
    assert_equal second.id, first.fetch('data').first.fetch('id')
    assert_equal 2, first.dig('meta', 'next_page')
    get '/api/calls', params: { per_page: 1, page: 2 }
    last = JSON.parse(response.body)
    assert_equal @call.id, last.fetch('data').first.fetch('id')
    assert_nil last.dig('meta', 'next_page')
  end
  private

  def login(user)
    post "/api/login", params: { auth: { email: user.email, password: "Password!42" } }
    assert_response :success
  end

end
