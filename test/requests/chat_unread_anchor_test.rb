require "test_helper"
class ChatUnreadAnchorTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Unread anchor", slug: "unread-anchor", kind: "private")
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: "reader-anchor@example.test")
    @other = create_test_user(workspace: @workspace, email: "sender-anchor@example.test")
    Current.user = @user
    @conversation = Conversation.create!(creator: @user, conversation_type: "group", title: "Unread")
    [@user, @other].each { |user| @conversation.conversation_participants.create!(user: user) }
    @read = @conversation.messages.create!(user: @other, body: "Read already")
    @conversation.conversation_participants.find_by!(user: @user).update!(last_read_message_id: @read.id)
    @conversation.messages.create!(user: @user, body: "My reply")
    @unread = @conversation.messages.create!(user: @other, body: "First unread")
    post "/api/login", params: { auth: { email: @user.email, password: "Password!42" } }
    assert_response :success
  end
  test "summary identifies the first incoming unread without changing read state" do
    get "/api/v1/conversations/#{@conversation.id}/summary"
    assert_response :success
    payload = response.parsed_body["data"] || response.parsed_body
    assert_equal @unread.id, payload["first_unread_message_id"]
    assert_equal @read.id, @conversation.conversation_participants.find_by!(user: @user).last_read_message_id
  end
end
