require "test_helper"

class CallsTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @workspace = Workspace.create!(name: "Calls Workspace", slug: "calls-workspace", kind: "private")
    Current.workspace = @workspace
    @caller = create_test_user(workspace: @workspace, email: "caller@example.test")
    @recipient = create_test_user(workspace: @workspace, email: "recipient@example.test")
    @outsider = create_test_user(workspace: @workspace, email: "outsider@example.test")

    Current.user = @caller
    @conversation = Conversation.create!(workspace: @workspace, creator: @caller, conversation_type: "direct")
    @conversation.conversation_participants.create!(workspace: @workspace, user: @caller)
    @conversation.conversation_participants.create!(workspace: @workspace, user: @recipient)

    @previous_livekit_url = ENV["LIVEKIT_URL"]
    @previous_livekit_key = ENV["LIVEKIT_API_KEY"]
    @previous_livekit_secret = ENV["LIVEKIT_API_SECRET"]
    ENV["LIVEKIT_URL"] = "ws://livekit.example.test"
    ENV["LIVEKIT_API_KEY"] = "testkey"
    ENV["LIVEKIT_API_SECRET"] = "testsecret"
    ActionMailer::Base.deliveries.clear
  end

  teardown do
    ENV["LIVEKIT_URL"] = @previous_livekit_url
    ENV["LIVEKIT_API_KEY"] = @previous_livekit_key
    ENV["LIVEKIT_API_SECRET"] = @previous_livekit_secret
    clear_enqueued_jobs
    clear_performed_jobs
  end

  test "only conversation participants can create calls" do
    login(@outsider)

    post "/api/conversations/#{@conversation.id}/calls", params: { call_type: "audio" }

    assert_response :not_found
  end

  test "creates one live call per conversation and joins with a LiveKit token" do
    login(@caller)

    post "/api/conversations/#{@conversation.id}/calls", params: { call_type: "video" }

    assert_response :created
    call_payload = JSON.parse(response.body).fetch("call_session")
    assert_equal "video", call_payload.fetch("call_type")
    assert_equal "ringing", call_payload.fetch("status")
    assert_match(/\A[0-9a-f-]{36}\z/, call_payload.fetch("public_id"))
    assert_match(%r{/meet/#{call_payload.fetch("public_id")}\z}, call_payload.fetch("share_url"))
    assert_equal true, call_payload.fetch("can_end")

    post "/api/conversations/#{@conversation.id}/calls", params: { call_type: "audio" }
    assert_response :conflict

    post "/api/calls/#{call_payload.fetch("id")}/join"
    assert_response :success
    join_payload = JSON.parse(response.body)
    assert_equal "ws://livekit.example.test", join_payload.fetch("server_url")
    decoded_token = JWT.decode(join_payload.fetch("participant_token"), "testsecret", true, algorithm: "HS256").first
    assert_equal "testkey", decoded_token.fetch("iss")
    assert_equal true, decoded_token.dig("video", "roomJoin")
  end

  test "authenticated external link holder joins idempotently without chat access" do
    login(@caller)
    post "/api/conversations/#{@conversation.id}/calls", params: { call_type: "video" }
    call_payload = JSON.parse(response.body).fetch("call_session")

    external_workspace = Workspace.create!(name: "External Workspace", slug: "external-workspace", kind: "private")
    Current.workspace = external_workspace
    external_user = create_test_user(workspace: external_workspace, email: "external-caller@example.test")
    login(external_user)

    get "/api/meet/#{call_payload.fetch("public_id")}"
    assert_response :success

    2.times do
      post "/api/meet/#{call_payload.fetch("public_id")}/join"
      assert_response :success
      assert_equal false, JSON.parse(response.body).dig("call_session", "can_end")
    end

    call_session = CallSession.unscoped.find(call_payload.fetch("id"))
    external_participants = call_session.call_participants.where(user_id: external_user.id)
    assert_equal 1, external_participants.count
    assert_equal @workspace.id, external_participants.first.workspace_id

    get "/api/conversations/#{@conversation.id}"
    assert_response :not_found
  end

  test "only the host can end for everyone and ended links cannot be joined" do
    login(@caller)
    post "/api/conversations/#{@conversation.id}/calls", params: { call_type: "audio" }
    call_payload = JSON.parse(response.body).fetch("call_session")

    login(@recipient)
    post "/api/calls/#{call_payload.fetch("id")}/end"
    assert_response :forbidden

    login(@caller)
    post "/api/calls/#{call_payload.fetch("id")}/end"
    assert_response :success

    login(@recipient)
    post "/api/meet/#{call_payload.fetch("public_id")}/join"
    assert_response :gone
  end

  test "each new call receives a different public meeting id" do
    login(@caller)
    post "/api/conversations/#{@conversation.id}/calls", params: { call_type: "audio" }
    first_call = JSON.parse(response.body).fetch("call_session")
    post "/api/calls/#{first_call.fetch("id")}/end"
    assert_response :success

    post "/api/conversations/#{@conversation.id}/calls", params: { call_type: "audio" }
    assert_response :created
    second_call = JSON.parse(response.body).fetch("call_session")

    assert_not_equal first_call.fetch("public_id"), second_call.fetch("public_id")
  end

  test "muted recipient does not receive chat or missed call notifications or email" do
    @conversation.conversation_participants.find_by!(user: @recipient).mute!(nil)

    login(@caller)

    post "/api/conversations/#{@conversation.id}/messages", params: { message: { body: "Muted chat message" } }
    assert_response :created
    assert_empty Notification.unscoped.where(recipient: @recipient, action: "chat_message")

    post "/api/conversations/#{@conversation.id}/calls", params: { call_type: "audio" }
    assert_response :created
    call_id = JSON.parse(response.body).dig("call_session", "id")

    perform_enqueued_jobs do
      CallSessionTimeoutJob.perform_now(call_id)
    end

    assert_empty Notification.unscoped.where(recipient: @recipient, action: "missed_call")
    assert_empty ActionMailer::Base.deliveries
  end

  test "unanswered calls create missed notification and email" do
    login(@caller)

    post "/api/conversations/#{@conversation.id}/calls", params: { call_type: "video" }
    assert_response :created
    call_id = JSON.parse(response.body).dig("call_session", "id")

    perform_enqueued_jobs do
      CallSessionTimeoutJob.perform_now(call_id)
    end

    notification = Notification.unscoped.find_by!(recipient: @recipient, action: "missed_call")
    assert_equal call_id, notification.metadata.fetch("call_session_id")
    assert_equal 1, ActionMailer::Base.deliveries.length
    assert_includes ActionMailer::Base.deliveries.last.to, @recipient.email
  end

  test "conversation show paginates messages and updates last message cache" do
    Current.user = @caller
    60.times do |index|
      @conversation.messages.create!(workspace: @workspace, user: index.even? ? @caller : @recipient, body: "Message #{index}")
    end
    latest_message = @conversation.messages.order(id: :desc).first
    @conversation.reload

    assert_equal latest_message.id, @conversation.last_message_id
    assert_equal latest_message.created_at.to_i, @conversation.last_message_at.to_i

    login(@caller)
    get "/api/conversations/#{@conversation.id}"

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal 50, payload.fetch("messages").length
    assert_equal true, payload.dig("messages_meta", "has_more")

    get "/api/conversations/#{@conversation.id}/messages", params: {
      before_id: payload.dig("messages_meta", "next_before_id"),
      limit: 20
    }

    assert_response :success
    page_payload = JSON.parse(response.body)
    assert_equal 10, page_payload.fetch("data").length
    assert_equal false, page_payload.dig("meta", "has_more")
  end

  private

  def login(user)
    post "/api/login", params: { auth: { email: user.email, password: "Password!42" } }
    assert_response :success
  end
end
