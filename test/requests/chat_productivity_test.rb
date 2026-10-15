require 'test_helper'
class ChatProductivityTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper
  setup do
    @workspace = Workspace.create!(name: 'Chat tools', slug: 'chat-tools', kind: 'private')
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: 'tools@example.test')
    @other = create_test_user(workspace: @workspace, email: 'tools-other@example.test')
    Current.user = @user
    @conversation = Conversation.create!(creator: @user, conversation_type: 'group', title: 'Tools')
    [@user, @other].each { |user| @conversation.conversation_participants.create!(user: user) }
    @root = @conversation.messages.create!(user: @user, body: 'Root')
    post '/api/login', params: { auth: { email: @user.email, password: 'Password!42' } }
    complete_test_mfa
    assert_response :success
  end
  test 'pin listing and paginated threads stay in their conversation' do
    reply = @conversation.messages.create!(user: @other, body: 'Thread reply', reply_to: @root)
    unrelated = @conversation.messages.create!(user: @other, body: 'Unrelated')
    patch "#{base}/messages/#{@root.id}/pin", params: { pinned: true }
    assert_response :success
    assert @root.reload.pinned_at
    get "#{base}/messages", params: { pinned: true }
    assert_equal [@root.id], response.parsed_body['data'].map { |row| row['id'] }
    get "#{base}/messages", params: { thread_id: @root.id, limit: 1 }
    assert_equal [reply.id], response.parsed_body['data'].map { |row| row['id'] }
    assert_equal @root.id, response.parsed_body.dig('meta', 'thread_root', 'id')
    assert response.parsed_body.dig('meta', 'has_more')
    patch "#{base}/messages/#{@root.id}/pin", params: { pinned: false }
    assert_response :success
    assert_nil @root.reload.pinned_at
    @conversation.conversation_participants.find_by!(user: @user).destroy!
    get "#{base}/messages", params: { thread_id: @root.id }
    assert_response :not_found
  end
  test 'shared gallery filters paginate visible attachments without leaking conversations' do
    image = @conversation.messages.create!(user: @other, body: 'Photo')
    image.attachments.attach(io: StringIO.new('image'), filename: 'photo.png', content_type: 'image/png')
    file = @conversation.messages.create!(user: @other, body: 'Report')
    file.attachments.attach(io: StringIO.new('report'), filename: 'report.txt', content_type: 'text/plain')
    hidden = @conversation.messages.create!(user: @other, body: 'Deleted photo', deleted_at: Time.current)
    hidden.attachments.attach(io: StringIO.new('image'), filename: 'hidden.png', content_type: 'image/png')
    get "#{base}/messages", params: { attachments: 'media' }
    assert_response :success
    assert_equal [image.id], response.parsed_body['data'].map { |row| row['id'] }
    get "#{base}/messages", params: { attachments: 'files' }
    assert_equal [file.id], response.parsed_body['data'].map { |row| row['id'] }
    get "#{base}/messages", params: { attachments: 'all', limit: 1 }
    assert_equal [file.id], response.parsed_body['data'].map { |row| row['id'] }
    assert response.parsed_body.dig('meta', 'has_more')
    get "#{base}/messages", params: { attachments: 'all', before_id: file.id, limit: 1 }
    assert_equal [image.id], response.parsed_body['data'].map { |row| row['id'] }
    get "#{base}/messages", params: { attachments: 'invalid' }
    assert_response :unprocessable_entity
    @conversation.conversation_participants.find_by!(user: @user).destroy!
    get "#{base}/messages", params: { attachments: 'media' }
    assert_response :not_found
  end
  test 'schedule is idempotent delivers once after due time and supports attachments' do
    send_at = 1.hour.from_now
    payload = { body: 'Later', send_at: send_at.iso8601, client_id: 'schedule-once', reply_to_id: @root.id }
    post "#{base}/scheduled_messages", params: { message: payload }
    assert_response :created
    id = response.parsed_body['id']
    post "#{base}/scheduled_messages", params: { message: payload }
    assert_response :success
    assert_equal id, response.parsed_body['id']
    schedule = ScheduledChatMessage.find(id)
    schedule.attachments.attach(io: StringIO.new('report'), filename: 'report.txt', content_type: 'text/plain')
    ScheduledChatDeliveryJob.perform_now(id)
    assert_equal 'pending', schedule.reload.state
    travel_to(send_at + 1.second) do
      2.times { ScheduledChatDeliveryJob.perform_now(id) }
    end
    assert_equal 'sent', schedule.reload.state
    assert_equal 1, @conversation.messages.where(client_id: "scheduled-#{id}").count
    assert_equal 'report.txt', schedule.sent_message.attachments.first.filename.to_s
    assert_equal @root.id, schedule.sent_message.reply_to_id
  end
  test 'only author can list or cancel schedules and cancelled sends never deliver' do
    post "#{base}/scheduled_messages", params: { message: { body: 'Cancel me', send_at: 1.hour.from_now.iso8601, client_id: 'cancel' } }
    assert_response :created
    id = response.parsed_body['id']
    post '/api/login', params: { auth: { email: @other.email, password: 'Password!42' } }
    complete_test_mfa
    get "#{base}/scheduled_messages"
    assert_empty response.parsed_body['data']
    delete "#{base}/scheduled_messages/#{id}"
    assert_response :not_found
    post '/api/login', params: { auth: { email: @user.email, password: 'Password!42' } }
    complete_test_mfa
    delete "#{base}/scheduled_messages/#{id}"
    assert_response :no_content
    travel 2.hours do
      ScheduledChatDeliveryJob.perform_now(id)
    end
    assert_equal 'cancelled', ScheduledChatMessage.find(id).state
    assert_equal 0, @conversation.messages.where(client_id: "scheduled-#{id}").count
  end
  test 'invalid time and foreign reply targets are rejected and departed members cannot send' do
    post "#{base}/scheduled_messages", params: { message: { body: 'Past', send_at: 1.hour.ago.iso8601, client_id: 'past' } }
    assert_response :unprocessable_entity
    post "#{base}/scheduled_messages", params: { message: { body: 'Late', send_at: 1.hour.from_now.iso8601, client_id: 'left' } }
    assert_response :created
    id = response.parsed_body['id']
    @conversation.conversation_participants.find_by!(user: @user).destroy!
    travel 2.hours do
      ScheduledChatDeliveryJob.perform_now(id)
    end
    assert_equal 'cancelled', ScheduledChatMessage.find(id).state
  end
  test 'native bearer clients share pins threads and schedules' do
    native = open_session
    native.post '/api/v1/auth/login', params: { auth: { email: @user.email, password: 'Password!42', device_name: 'Tools' } }
    complete_test_mfa native: true
    assert_equal 200, native.response.status
    headers = { 'Authorization' => "Bearer #{native.response.parsed_body.dig('data', 'access_token')}", 'Accept' => 'application/json' }
    path = "/api/v1/conversations/#{@conversation.id}"
    native.patch "#{path}/messages/#{@root.id}/pin", params: { pinned: true }, headers: headers
    assert_equal 200, native.response.status
    assert native.response.parsed_body.dig('data', 'pinned_at')
    native.get "#{path}/messages", params: { thread_id: @root.id }, headers: headers
    assert_equal @root.id, native.response.parsed_body.dig('meta', 'thread_root', 'id')
    native.post "#{path}/scheduled_messages", params: { message: { body: 'Native schedule', send_at: 1.hour.from_now.iso8601, client_id: 'native-schedule' } }, headers: headers
    assert_equal 201, native.response.status
    id = native.response.parsed_body.dig('data', 'id')
    native.delete "#{path}/scheduled_messages/#{id}", headers: headers
    assert_equal 200, native.response.status
  end
  test 'foreign reply targets and missing client ids are rejected' do
    other_conversation = Conversation.create!(creator: @other, conversation_type: 'group', title: 'Other')
    other_conversation.conversation_participants.create!(user: @other)
    foreign = other_conversation.messages.create!(user: @other, body: 'Private')
    post "#{base}/scheduled_messages", params: { message: { body: 'Invalid', send_at: 1.hour.from_now.iso8601, client_id: 'foreign', reply_to_id: foreign.id } }
    assert_response :unprocessable_entity
    post "#{base}/scheduled_messages", params: { message: { body: 'Invalid', send_at: 1.hour.from_now.iso8601 } }
    assert_response :unprocessable_entity
  end
  private
  def base
    "/api/conversations/#{@conversation.id}"
  end
end
