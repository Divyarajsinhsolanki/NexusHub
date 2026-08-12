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

  test "group creator can rename the group and add workspace members" do
    group = create_group(@creator, @participant)
    newcomer = create_test_user(workspace: @workspace, email: "chat-newcomer@example.test")
    login(@creator)

    patch "/api/conversations/#{group.id}", params: { conversation: { title: "Launch room" } }

    assert_response :success
    assert_equal "Launch room", group.reload.title

    post "/api/conversations/#{group.id}/participants", params: { participant_ids: [newcomer.id] }

    assert_response :created
    payload = JSON.parse(response.body)
    assert_equal true, payload.fetch("can_manage_members")
    assert_equal [@creator.id, @participant.id, newcomer.id].sort, payload.fetch("participants").pluck("id").sort
    assert_equal true, payload.fetch("participants").find { |participant| participant.fetch("id") == @creator.id }.fetch("is_creator")
  end

  test "regular group members cannot rename or add people" do
    group = create_group(@creator, @participant)
    newcomer = create_test_user(workspace: @workspace, email: "chat-blocked-newcomer@example.test")
    login(@participant)

    patch "/api/conversations/#{group.id}", params: { conversation: { title: "Not allowed" } }
    assert_response :forbidden

    post "/api/conversations/#{group.id}/participants", params: { participant_ids: [newcomer.id] }
    assert_response :forbidden
    assert_not group.participant_ids.include?(newcomer.id)
  end

  test "adding a group member invites them to an active call" do
    group = create_group(@creator, @participant)
    newcomer = create_test_user(workspace: @workspace, email: "chat-call-newcomer@example.test")
    call_session = create_active_call(group, initiator: @creator)
    login(@creator)

    post "/api/conversations/#{group.id}/participants", params: { participant_ids: [newcomer.id] }

    assert_response :created
    call_participant = call_session.call_participants.find_by!(user: newcomer)
    assert_equal "ringing", call_participant.status
    assert_nil call_participant.joined_at
    assert_nil call_participant.left_at
  end

  test "removing a member revokes their active call access" do
    group = create_group(@creator, @participant)
    call_session = create_active_call(group, initiator: @creator)
    login(@creator)

    delete "/api/conversations/#{group.id}/participants/#{@participant.id}"

    assert_response :success
    assert_not group.reload.participant_ids.include?(@participant.id)
    removed_call_participant = call_session.call_participants.find_by!(user: @participant)
    assert_equal "left", removed_call_participant.reload.status
    assert removed_call_participant.left_at.present?

    login(@participant)
    post "/api/calls/#{call_session.id}/join"
    assert_response :unprocessable_entity
    assert_equal "You no longer have access to this group call", JSON.parse(response.body).fetch("message")
  end

  test "a non-creator can leave a group but the creator must delete it" do
    group = create_group(@creator, @participant)
    login(@participant)

    delete "/api/conversations/#{group.id}/leave"

    assert_response :success
    assert_not group.reload.participant_ids.include?(@participant.id)

    login(@creator)
    delete "/api/conversations/#{group.id}/leave"
    assert_response :unprocessable_entity
    assert_equal "creator_required", JSON.parse(response.body).fetch("error")
  end

  private

  def create_group(creator, *participants)
    group = Conversation.create!(workspace: @workspace, creator: creator, conversation_type: "group", title: "Delivery room")
    ([creator] + participants).each do |participant|
      group.conversation_participants.create!(workspace: @workspace, user: participant)
    end
    group
  end

  def create_active_call(conversation, initiator:)
    call_session = conversation.call_sessions.create!(
      workspace: @workspace,
      initiator: initiator,
      call_type: "video",
      status: "active",
      livekit_room_name: "test-room-#{SecureRandom.hex(6)}",
      started_at: Time.current
    )
    conversation.participants.each do |participant|
      call_session.call_participants.create!(
        workspace: @workspace,
        user: participant,
        status: participant.id == initiator.id ? "joined" : "ringing",
        joined_at: (Time.current if participant.id == initiator.id)
      )
    end
    call_session
  end

  def login(user)
    post "/api/login", params: { auth: { email: user.email, password: "Password!42" } }
    assert_response :success
  end
end
