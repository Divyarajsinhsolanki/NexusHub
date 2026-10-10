require "test_helper"
require "minitest/mock"

class ChatMessageLifecycleTest < ActionDispatch::IntegrationTest
  include ActionCable::TestHelper
  setup do
    @workspace = Workspace.create!(name: "Lifecycle", slug: "chat-lifecycle", kind: "private")
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: "author@example.test")
    @other = create_test_user(workspace: @workspace, email: "reader@example.test")
    Current.user = @user
    @conversation = Conversation.create!(creator: @user, conversation_type: "group", title: "Lifecycle")
    [@user, @other].each { |user| @conversation.conversation_participants.create!(user: user) }
    @message = @conversation.messages.create!(user: @user, body: "Original")
    post "/api/login", params: { auth: { email: @user.email, password: "Password!42" } }
    assert_response :success
  end

  test "author edits before deadline and server rejects the exact boundary" do
    travel_to(@message.created_at + 15.minutes - 1.second) do
      patch message_path, params: { message: { body: "Edited", user_id: @other.id } }
      assert_response :success
      assert_equal "Edited", @message.reload.body
      assert_equal @user.id, @message.user_id
      assert @message.edited_at
    end
    travel_to(@message.created_at + 15.minutes, with_usec: true) do
      post "/api/login", params: { auth: { email: @user.email, password: "Password!42" } }
      patch message_path, params: { message: { body: "Too late" } }
      assert_response :forbidden
      delete message_path
      assert_response :forbidden
    end
  end

  test "other members and users outside the workspace cannot change a message" do
    post "/api/login", params: { auth: { email: @other.email, password: "Password!42" } }
    patch message_path, params: { message: { body: "Not mine" } }
    assert_response :forbidden
    foreign_workspace = Workspace.create!(name: "Other", slug: "other-chat", kind: "private")
    Current.workspace = foreign_workspace
    outsider = create_test_user(workspace: foreign_workspace, email: "outsider@example.test")
    post "/api/login", params: { auth: { email: outsider.email, password: "Password!42" } }
    [message_path, "/api/v1/conversations/#{@conversation.id}/messages/#{@message.id}"].each do |path|
      patch path, params: { message: { body: "Not ours" } }
      assert_response :not_found
    end
  end

  test "delete preserves replies and receipts but removes content attachments reactions and search matches" do
    @message.attachments.attach(io: StringIO.new("private"), filename: "private-report.txt", content_type: "text/plain")
    @message.message_reactions.create!(user: @other, emoji: "👍")
    reply = @conversation.messages.create!(user: @other, body: "Reply", reply_to: @message)
    receipt = @conversation.conversation_participants.find_by!(user: @other)
    receipt.update!(last_read_message_id: @message.id)
    delete message_path
    assert_response :success
    assert @message.reload.deleted_at
    assert_equal "Message deleted", @message.body
    assert_empty @message.attachments
    assert_empty @message.message_reactions
    assert_equal @message.id, reply.reload.reply_to_id
    assert_equal "Message deleted", reply.chat_context[:reply_to][:body]
    assert_equal @message.id, receipt.reload.last_read_message_id
    assert Notification.where(notifiable: @message).all? { |notification| notification.metadata["message_preview"] == "Message deleted" }
    get collection_path, params: { q: "private-report" }
    assert_response :success
    assert_empty response.parsed_body["data"]
    post "#{message_path}/reactions", params: { message_reaction: { emoji: "👍" } }
    assert_response :not_found
  end

  test "search finds unloaded history and filenames, paginates and escapes wildcards" do
    60.times { |index| @conversation.messages.create!(user: @user, body: "Later #{index}") }
    @message.attachments.attach(io: StringIO.new("report"), filename: "budget_100%.txt", content_type: "text/plain")
    get collection_path
    refute_includes response.parsed_body["data"].map { |message| message["id"] }, @message.id
    get collection_path, params: { q: "budget_100%" }
    assert_equal [@message.id], response.parsed_body["data"].map { |message| message["id"] }
    get collection_path, params: { q: "Later", limit: 10 }
    first = response.parsed_body
    assert_equal 10, first["data"].length
    assert first["meta"]["has_more"]
    get collection_path, params: { q: "Later", limit: 10, before_id: first["meta"]["next_before_id"] }
    assert_empty(first["data"].map { |row| row["id"] } & response.parsed_body["data"].map { |row| row["id"] })
    get collection_path, params: { around_id: @message.id }
    assert_response :success
    assert_includes response.parsed_body["data"].map { |message| message["id"] }, @message.id
  end

  test "sync returns edits and more than one page of missed messages" do
    since = Time.current.iso8601(6)
    patch message_path, params: { message: { body: "Changed offline" } }
    55.times { |index| @conversation.messages.create!(user: @other, body: "Offline #{index}") }
    get collection_path, params: { updated_since: since, limit: 50 }
    first = response.parsed_body
    assert_equal "Changed offline", first["data"].first["body"]
    assert first["meta"]["has_more"]
    get collection_path, params: { updated_since: since, limit: 50, after_id: first["meta"]["next_after_id"] }
    assert_equal 6, response.parsed_body["data"].length
  end

  test "retrying the same client id produces one message" do
    assert_difference -> { @conversation.messages.count }, 1 do
      2.times do
        post collection_path, params: { message: { body: "Once", client_id: "same-draft" } }
        assert_response :success
      end
    end
  end

  test "loaded reaction serialization does not issue per-message queries" do
    @message.message_reactions.create!(user: @other, emoji: "👍")
    messages = @conversation.messages.includes(:message_reactions).to_a
    queries = []
    listener = ->(*args) { queries << args.last[:sql] unless args.last[:cached] }
    ActiveSupport::Notifications.subscribed(listener, "sql.active_record") do
      messages.each { |message| assert_equal({ "👍" => 1 }, message.reaction_counts); assert_equal [], message.reacted_emojis_for(@user) }
    end
    assert_empty queries
  end

  test "system messages cannot be edited and blank text without attachments is rejected" do
    @message.update!(message_type: "system")
    patch message_path, params: { message: { body: "Fake" } }
    assert_response :forbidden
    @message.update!(message_type: "message")
    patch message_path, params: { message: { body: " " } }
    assert_response :unprocessable_entity
  end

  test "native bearer client shares message lifecycle receipts and reactions with web" do
    mobile = open_session
    mobile.post "/api/v1/auth/login", params: { auth: { email: @other.email, password: "Password!42", device_name: "Chat test" } }
    assert_equal 200, mobile.response.status
    token = mobile.response.parsed_body.dig("data", "access_token")
    headers = { "Authorization" => "Bearer #{token}", "Accept" => "application/json" }
    path = "/api/v1/conversations/#{@conversation.id}/messages"
    mobile.post path, params: { message: { body: "Native message", client_id: "native-lifecycle" } }, headers: headers
    assert_equal 201, mobile.response.status
    id = mobile.response.parsed_body.dig("data", "id")
    assert id
    get collection_path
    assert_includes response.parsed_body["data"].map { |message| message["id"] }, id
    mobile.patch "#{path}/#{id}", params: { message: { body: "Native edit" } }, headers: headers
    assert_equal 200, mobile.response.status
    assert_equal "Native edit", mobile.response.parsed_body.dig("data", "body")
    post "#{collection_path}/#{id}/reactions", params: { message_reaction: { emoji: "👍" } }
    assert_response :created
    mobile.get path, headers: headers
    native_message = mobile.response.parsed_body["data"].find { |message| message["id"] == id }
    assert_equal({ "👍" => 1 }, native_message["reactions"])
    mobile.patch "/api/v1/conversations/#{@conversation.id}/receipt", params: { receipt: { message_id: @message.id, state: "read" } }, headers: headers
    assert_equal 200, mobile.response.status
    mobile.delete "#{path}/#{id}", headers: headers
    assert_equal 200, mobile.response.status
    assert_equal "Message deleted", mobile.response.parsed_body.dig("data", "body")
    get collection_path
    assert_equal "Message deleted", response.parsed_body["data"].find { |message| message["id"] == id }["body"]
  end

  test "preview only fetches links in visible messages and wraps mobile data" do
    @message.update!(body: "Read www.example.com?x=1.")
    url = "https://www.example.com/?x=1"
    result = { title: "Example", description: "News", hostname: "www.example.com" }
    Chat::LinkPreview.stub(:call, ->(requested) { assert_equal url, requested; result }) do
      get "#{message_path}/link_preview", params: { url: url }
      assert_response :success
      assert_equal "Example", response.parsed_body["title"]
      get "/api/v1/conversations/#{@conversation.id}/messages/#{@message.id}/link_preview", params: { url: url }
      assert_response :success
      assert_equal "Example", response.parsed_body.dig("data", "title")
    end
    Chat::LinkPreview.stub(:call, ->(*) { flunk "Must not fetch unrelated or deleted links" }) do
      get "#{message_path}/link_preview", params: { url: "https://unrelated.example/" }
      assert_response :unprocessable_entity
      @message.update!(deleted_at: Time.current)
      get "#{message_path}/link_preview", params: { url: url }
      assert_response :unprocessable_entity
    end
    outsider = create_test_user(workspace: @workspace, email: "preview-outsider@example.test")
    other_conversation = Conversation.create!(creator: outsider, conversation_type: "group", title: "Private")
    other_conversation.conversation_participants.create!(user: outsider)
    hidden = other_conversation.messages.create!(user: outsider, body: url)
    get "/api/conversations/#{other_conversation.id}/messages/#{hidden.id}/link_preview", params: { url: url }
    assert_response :not_found
  end

  private

  def collection_path
    "/api/conversations/#{@conversation.id}/messages"
  end

  def message_path
    "#{collection_path}/#{@message.id}"
  end
end
