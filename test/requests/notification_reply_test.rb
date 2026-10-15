require 'test_helper'
class NotificationReplyTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: 'Notification replies', slug: 'notification-replies', kind: 'private')
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: 'reply-recipient@example.test')
    @sender = create_test_user(workspace: @workspace, email: 'reply-sender@example.test')
    Current.user = @user
    @conversation = Conversation.create!(creator: @sender, conversation_type: 'group', title: 'Replies')
    [@user, @sender].each { |person| @conversation.conversation_participants.create!(user: person) }
    @target = @conversation.messages.create!(user: @sender, body: 'Can you help?')
    @notice = Notification.create!(recipient: @user, actor: @sender, action: 'chat_message', notifiable: @target,
      metadata: { conversation_id: @conversation.id, message_id: @target.id })
    post '/api/v1/auth/login', params: { auth: { email: @user.email, password: 'Password!42', device_name: 'Reply phone' } }
    complete_test_mfa native: true
    assert_response :success
    @headers = { 'Authorization' => "Bearer #{response.parsed_body.dig('data', 'access_token')}", 'Accept' => 'application/json' }
  end
  test 'inline reply is threaded idempotent and does not read newer unseen messages' do
    later = @conversation.messages.create!(user: @sender, body: 'Another unseen message')
    send_reply
    assert_response :success
    result = response.parsed_body['data']
    message = Message.find(result['message_id'])
    assert_equal @target.id, message.reply_to_id
    assert_equal @user.id, message.user_id
    assert_equal 'On it', message.body
    assert @notice.reload.read_at
    membership = @conversation.conversation_participants.find_by!(user: @user)
    assert_equal @target.id, membership.last_read_message_id
    assert_operator later.id, :>, membership.last_read_message_id
    send_reply
    assert_response :success
    assert_equal message.id, response.parsed_body.dig('data', 'message_id')
    assert_equal 1, @conversation.messages.where(user: @user).count
  end
  test 'a deleted original message becomes a normal reply without exposing old content' do
    @target.update!(deleted_at: Time.current, body: 'Message deleted')
    send_reply
    assert_response :success
    assert_nil Message.find(response.parsed_body.dig('data', 'message_id')).reply_to_id
  end
  test 'requires notification ownership and current conversation membership' do
    @notice.update!(recipient: @sender)
    send_reply
    assert_response :not_found
    @notice.update!(recipient: @user)
    @conversation.conversation_participants.find_by!(user: @user).destroy!
    send_reply
    assert_response :not_found
    assert_equal 0, @conversation.messages.where(user: @user).count
  end
  test 'rejects invalid text identifiers and non-chat notifications' do
    ['', 'x' * 4001].each do |body|
      send_reply(body: body)
      assert_response :unprocessable_entity
    end
    send_reply(client_id: '')
    assert_response :unprocessable_entity
    @notice.update!(action: 'post_liked')
    send_reply
    assert_response :unprocessable_entity
    assert_equal 0, @conversation.messages.where(user: @user).count
  end
  test 'ignores conversation and reply IDs supplied by a caller' do
    send_reply(conversation_id: 999999, reply_to_id: 999999)
    assert_response :success
    assert_equal @conversation.id, response.parsed_body.dig('data', 'conversation_id')
    assert_equal @target.id, response.parsed_body.dig('data', 'reply_to_id')
  end
  private
  def send_reply(**overrides)
    post "/api/v1/notifications/#{@notice.id}/reply", params: { message: { body: 'On it', client_id: 'push-stable' }.merge(overrides) }, headers: @headers
  end
end
