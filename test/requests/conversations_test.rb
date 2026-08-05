require "test_helper"

class ConversationsTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Chat API", slug: "chat-api", kind: "private")
    Current.workspace = @workspace

    @creator = create_test_user(workspace: @workspace, email: "chat-creator@example.test")
    @participant = create_test_user(workspace: @workspace, email: "chat-participant@example.test")
    @admin = create_test_user(workspace: @workspace, email: "chat-admin@example.test")
    @admin.roles << Role.find_by!(name: "admin")

    Current.user = @creator
    @conversation = Conversation.create!(workspace: @workspace, creator: @creator, conversation_type: "direct")
    @conversation.conversation_participants.create!(workspace: @workspace, user: @creator)
    @conversation.conversation_participants.create!(workspace: @workspace, user: @participant)
    @message = @conversation.messages.create!(workspace: @workspace, user: @participant, body: "Hello from chat")
  end

  test "summary requires authentication" do
    get "/api/conversations/#{@conversation.id}/summary"

    assert_response :unauthorized
  end

  test "summary returns delete permissions for creator" do
    login(@creator)

    get "/api/conversations/#{@conversation.id}/summary"

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal @conversation.id, payload.fetch("id")
    assert_equal @creator.id, payload.fetch("creator_id")
    assert_equal true, payload.fetch("can_delete_for_everyone")
  end

  test "hiding a conversation only removes current user's membership from visible scope" do
    login(@creator)

    delete "/api/conversations/#{@conversation.id}"

    assert_response :success
    assert @conversation.conversation_participants.find_by!(user: @creator).reload.hidden_at.present?
    assert_nil @conversation.conversation_participants.find_by!(user: @participant).reload.hidden_at

    get "/api/conversations", params: { page: 1, per_page: 30 }
    assert_response :success
    ids = JSON.parse(response.body).fetch("data").map { |conversation| conversation.fetch("id") }
    assert_not_includes ids, @conversation.id
  end

  test "new incoming message restores a hidden conversation" do
    @conversation.conversation_participants.find_by!(user: @creator).update!(hidden_at: 1.hour.ago)

    Current.user = @participant
    @conversation.messages.create!(workspace: @workspace, user: @participant, body: "This should restore the chat")

    assert_nil @conversation.conversation_participants.find_by!(user: @creator).reload.hidden_at
  end

  test "receipt endpoint returns monotonic delivered and read cursors" do
    second_message = @conversation.messages.create!(workspace: @workspace, user: @participant, body: "Newest")
    login(@creator)

    patch "/api/conversations/#{@conversation.id}/receipt", params: { receipt: { message_id: second_message.id, state: "read" } }

    assert_response :success
    payload = JSON.parse(response.body).fetch("receipt")
    assert_equal second_message.id, payload.fetch("read_message_id")
    assert_equal second_message.id, payload.fetch("delivered_message_id")

    patch "/api/conversations/#{@conversation.id}/receipt", params: { receipt: { message_id: @message.id, state: "delivered" } }

    assert_response :success
    payload = JSON.parse(response.body).fetch("receipt")
    assert_equal second_message.id, payload.fetch("read_message_id")
    assert_equal second_message.id, payload.fetch("delivered_message_id")
  end

  test "receipt endpoint requires conversation membership" do
    outsider = create_test_user(workspace: @workspace, email: "chat-outsider@example.test")
    login(outsider)

    patch "/api/conversations/#{@conversation.id}/receipt", params: { receipt: { message_id: @message.id, state: "read" } }

    assert_response :not_found
  end

  test "regular participant cannot delete a conversation for everyone" do
    login(@participant)

    delete "/api/conversations/#{@conversation.id}/for_everyone", params: { confirmation: "DELETE #{@conversation.id}" }

    assert_response :forbidden
    assert Conversation.unscoped.exists?(@conversation.id)
  end

  test "delete for everyone requires confirmation" do
    login(@creator)

    delete "/api/conversations/#{@conversation.id}/for_everyone", params: { confirmation: "DELETE" }

    assert_response :unprocessable_entity
    payload = JSON.parse(response.body)
    assert_equal "confirmation_required", payload.fetch("error")
  end

  test "admin participant can delete a conversation for everyone and cleanup chat notifications" do
    @conversation.conversation_participants.create!(workspace: @workspace, user: @admin)
    reaction = @message.message_reactions.create!(workspace: @workspace, user: @creator, emoji: "👍")
    Notification.create!(
      workspace: @workspace,
      recipient: @creator,
      actor: @participant,
      action: "chat_message",
      notifiable: @message,
      metadata: { conversation_id: @conversation.id }
    )
    Notification.create!(
      workspace: @workspace,
      recipient: @participant,
      actor: @creator,
      action: "reacted",
      notifiable: reaction,
      metadata: { conversation_id: @conversation.id }
    )

    login(@admin)

    delete "/api/conversations/#{@conversation.id}/for_everyone", params: { confirmation: "DELETE #{@conversation.id}" }

    assert_response :success
    assert_not Conversation.unscoped.exists?(@conversation.id)
    assert_not Message.unscoped.exists?(@message.id)
    assert_not MessageReaction.unscoped.exists?(reaction.id)
    assert_empty Notification.unscoped.where("metadata ->> 'conversation_id' = ?", @conversation.id.to_s)
  end

  private

  def login(user)
    post "/api/login", params: { auth: { email: user.email, password: "Password!42" } }
    assert_response :success
  end
end
