require "test_helper"
require "minitest/mock"

class Chat::ReceiptManagerTest < ActiveSupport::TestCase
  setup do
    @workspace = Workspace.create!(name: "Receipt Workspace", slug: "receipt-workspace", kind: "private")
    Current.workspace = @workspace
    @sender = create_test_user(workspace: @workspace, email: "receipt-sender@example.test")
    @recipient = create_test_user(workspace: @workspace, email: "receipt-recipient@example.test")
    @third_user = create_test_user(workspace: @workspace, email: "receipt-third@example.test")
    @outsider = create_test_user(workspace: @workspace, email: "receipt-outsider@example.test")
    @conversation = Conversation.create!(workspace: @workspace, creator: @sender, conversation_type: "group", title: "Receipts")
    [@sender, @recipient, @third_user].each do |user|
      @conversation.conversation_participants.create!(workspace: @workspace, user: user)
    end
    @first_message = @conversation.messages.create!(workspace: @workspace, user: @sender, body: "First")
    @second_message = @conversation.messages.create!(workspace: @workspace, user: @sender, body: "Second")
  end

  test "receipt cursors only move forward and read advances delivery" do
    manager = Chat::ReceiptManager.new(user: @recipient)

    Chat::Broadcaster.stub(:broadcast_message_receipt_updated, ->(*) {}) do
      membership = manager.update(conversation: @conversation, message_id: @second_message.id, state: "read")
      original_read_at = membership.last_read_at
      original_delivered_at = membership.last_delivered_at

      assert_equal @second_message.id, membership.last_read_message_id
      assert_equal @second_message.id, membership.last_delivered_message_id

      manager.update(conversation: @conversation, message_id: @first_message.id, state: "delivered")
      membership.reload

      assert_equal @second_message.id, membership.last_read_message_id
      assert_equal @second_message.id, membership.last_delivered_message_id
      assert_equal original_read_at, membership.last_read_at
      assert_equal original_delivered_at, membership.last_delivered_at
    end
  end

  test "each group recipient has an independent high-water mark" do
    Chat::Broadcaster.stub(:broadcast_message_receipt_updated, ->(*) {}) do
      Chat::ReceiptManager.new(user: @recipient).update(conversation: @conversation, message_id: @second_message.id, state: "read")
      Chat::ReceiptManager.new(user: @third_user).update(conversation: @conversation, message_id: @second_message.id, state: "delivered")
    end

    assert_equal @second_message.id, @conversation.conversation_participants.find_by!(user: @recipient).last_read_message_id
    assert_nil @conversation.conversation_participants.find_by!(user: @third_user).last_read_message_id
    assert_equal @second_message.id, @conversation.conversation_participants.find_by!(user: @third_user).last_delivered_message_id
  end

  test "non-members and messages from another conversation are rejected" do
    assert_raises(ActiveRecord::RecordNotFound) do
      Chat::ReceiptManager.new(user: @outsider).update(conversation: @conversation, message_id: @second_message.id, state: "read")
    end

    other_conversation = Conversation.create!(workspace: @workspace, creator: @sender, conversation_type: "direct")
    other_conversation.conversation_participants.create!(workspace: @workspace, user: @sender)
    other_message = other_conversation.messages.create!(workspace: @workspace, user: @sender, body: "Other")

    assert_raises(ActiveRecord::RecordNotFound) do
      Chat::ReceiptManager.new(user: @recipient).update(conversation: @conversation, message_id: other_message.id, state: "delivered")
    end
  end

  test "receipt broadcasts include both cursor ids" do
    membership = @conversation.conversation_participants.find_by!(user: @recipient)
    membership.update!(
      last_delivered_message_id: @second_message.id,
      last_read_message_id: @first_message.id,
      last_delivered_at: Time.current,
      last_read_at: Time.current
    )
    broadcasts = []

    ActionCable.server.stub(:broadcast, ->(stream, payload) { broadcasts << [stream, payload] }) do
      Chat::Broadcaster.broadcast_message_receipt_updated(@conversation, membership)
    end

    payload = broadcasts.map(&:last).find { |event| event[:type] == "message_receipt_updated" }
    assert_equal @second_message.id, payload[:delivered_message_id]
    assert_equal @first_message.id, payload[:read_message_id]
    assert_includes broadcasts.map(&:first), Chat::Broadcaster.conversation_stream(@workspace.id, @conversation.id)
    assert_includes broadcasts.map(&:first), Chat::Broadcaster.user_stream(@workspace.id, @sender.id)
  end

  test "incoming messages are broadcast to recipient user streams while the thread is closed" do
    broadcasts = []

    ActionCable.server.stub(:broadcast, ->(stream, payload) { broadcasts << [stream, payload] }) do
      @conversation.messages.create!(workspace: @workspace, user: @sender, body: "Background delivery")
    end

    message_streams = broadcasts.filter_map { |stream, payload| stream if payload[:type] == "message_created" }
    assert_includes message_streams, Chat::Broadcaster.conversation_stream(@workspace.id, @conversation.id)
    assert_includes message_streams, Chat::Broadcaster.user_stream(@workspace.id, @recipient.id)
    assert_includes message_streams, Chat::Broadcaster.user_stream(@workspace.id, @third_user.id)
    assert_not_includes message_streams, Chat::Broadcaster.user_stream(@workspace.id, @sender.id)
  end
end
