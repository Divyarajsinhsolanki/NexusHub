require 'test_helper'

class ChatMessageContextTest < ActionDispatch::IntegrationTest
  include ActionCable::TestHelper
  setup do
    @workspace = Workspace.create!(name: 'Reply tests', slug: 'reply-tests', kind: 'private')
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: 'reply@example.test')
    Current.user = @user
    @conversation = Conversation.create!(creator: @user, conversation_type: 'group', title: 'Replies')
    @conversation.conversation_participants.create!(user: @user)
    @original = @conversation.messages.create!(user: @user, body: 'Original')
    login(@user)
  end

  test 'reply context persists through creation and history' do
    post "/api/conversations/#{@conversation.id}/messages", params: { message: { body: 'Reply', reply_to_id: @original.id, client_id: 'reply-one' } }
    assert_response :created
    assert_equal @original.id, response.parsed_body.fetch('reply_to').fetch('id')
    get "/api/conversations/#{@conversation.id}/messages"
    assert_response :success
    reply = response.parsed_body.fetch('data').last
    assert_equal 'Original', reply.fetch('reply_to').fetch('body')
    @user.update!(first_name: 'Renamed')
    get "/api/conversations/#{@conversation.id}/messages"
    assert_equal @user.full_name, response.parsed_body.fetch('data').last.fetch('reply_to').fetch('user_name')
  end

  test 'cannot reply to another conversation or missing message or forge system logs' do
    other = Conversation.create!(creator: @user, conversation_type: 'group', title: 'Other')
    target = other.messages.create!(user: @user, body: 'Private target')
    [target.id, Message.maximum(:id) + 100].each do |id|
      post "/api/conversations/#{@conversation.id}/messages", params: { message: { body: 'Reply', reply_to_id: id } }
      assert_response :unprocessable_entity
    end
    post "/api/conversations/#{@conversation.id}/messages", params: { message: { body: 'Forged log', message_type: 'system' } }
    assert_response :created
    assert_equal 'message', response.parsed_body.fetch('message_type')
  end

  test 'deleting a reply target leaves the reply intact' do
    reply = @conversation.messages.create!(user: @user, body: 'Reply', reply_to: @original)
    @original.destroy!
    assert_nil reply.reload.reply_to_id
  end

  test 'profile saves broadcast the new author identity' do
    stream = Chat::Broadcaster.user_stream(@workspace.id, @user.id)
    assert_broadcast_on(stream, { type: 'user_profile_updated', user_id: @user.id, user_name: 'Renamed User', user_profile_picture: nil }) do
      post '/api/update_profile', params: { auth: { first_name: 'Renamed', last_name: 'User' } }
      assert_response :success
    end
  end

  private

  def login(user)
    post '/api/login', params: { auth: { email: user.email, password: 'Password!42' } }
    assert_response :success
  end
end
