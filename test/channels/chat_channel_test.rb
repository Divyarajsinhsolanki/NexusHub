require "test_helper"

class ChatChannelTest < ActionCable::Channel::TestCase
  tests ChatChannel

  setup do
    @workspace = Workspace.create!(name: "Chat streams", slug: "chat-streams", kind: "private")
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: "chat-streams@example.test")
    @conversation = Conversation.create!(creator: @user, conversation_type: "group", title: "Private group")
    @membership = @conversation.conversation_participants.create!(user: @user)
    @event = { "type" => "message_created", "conversation_id" => @conversation.id, "message" => { "body" => "Private update" } }
    stub_connection current_user: @user, current_workspace: @workspace
  end

  test "active members receive events without a request workspace" do
    handler = stream_handler(conversation_id: @conversation.id)
    Current.reset_all
    handler.call(@event)
    assert_equal @event, transmissions.last
    assert_nil Current.workspace
  end

  test "removal blocks queued events and stops an existing conversation subscription" do
    handler = stream_handler(conversation_id: @conversation.id)
    @membership.destroy!
    Current.reset_all
    handler.call(@event)
    assert_empty transmissions
    assert_empty subscription.streams
    assert subscription.rejected?
  end

  test "soft removal also blocks events on an existing subscription" do
    handler = stream_handler(conversation_id: @conversation.id)
    @membership.update!(removed_at: Time.current)
    handler.call(@event)
    assert_empty transmissions
    assert subscription.rejected?
  end

  test "workspace suspension blocks an existing conversation subscription" do
    handler = stream_handler(conversation_id: @conversation.id)
    @user.membership_for.update!(status: "suspended")
    handler.call(@event)
    assert_empty transmissions
    assert subscription.rejected?
  end

  test "inbox stream drops queued group messages but keeps removal notices" do
    handler = stream_handler
    handler.call(@event)
    assert_equal 1, transmissions.size
    @membership.destroy!
    handler.call(@event)
    assert_equal 1, transmissions.size
    notice = { "type" => "conversation_removed", "conversation_id" => @conversation.id }
    handler.call(notice)
    assert_equal notice, transmissions.last
    assert_not subscription.rejected?
  end

  private

  # Rails' ChannelStub normally discards stream callbacks. Capture the real
  # callback registered by subscribed so tests exercise delivery authorization.
  def stream_handler(**params)
    subscribe(**params)
    handler = nil
    subscription.define_singleton_method(:stream_from) do |_name, coder:, &block|
      raise "Expected JSON stream decoding" unless coder == ActiveSupport::JSON
      handler = block
    end
    subscription.subscribed
    handler
  end
end
