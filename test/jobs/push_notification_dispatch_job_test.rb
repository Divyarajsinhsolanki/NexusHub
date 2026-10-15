require "test_helper"
require "minitest/mock"

class PushNotificationDispatchJobTest < ActiveSupport::TestCase
  setup do
    @workspace = Workspace.create!(name: "Push Dispatch", slug: "push-dispatch", kind: "private")
    Current.workspace = @workspace
    @actor = create_test_user(workspace: @workspace, email: "dispatch-actor@example.test")
    @recipient = create_test_user(workspace: @workspace, email: "dispatch-recipient@example.test")
    @conversation = Conversation.create!(creator: @actor, conversation_type: "group", title: "Delivery")
    @conversation.conversation_participants.create!(user: @actor)
    @membership = @conversation.conversation_participants.create!(user: @recipient)
    MobileDevice.create!(workspace: @workspace, user: @recipient, expo_push_token: "ExponentPushToken[dispatch]", platform: "android", push_schema_version: 3)
  end

  test "a message burst delivers only its latest unread preview" do
    first = make_notification("First")
    last = make_notification("Last")
    entries = []
    dispatcher = Object.new
    dispatcher.define_singleton_method(:call) { |batch| entries.concat(batch) }
    PushNotifications::DeliveryDispatcher.stub(:new, -> { dispatcher }) do
      PushNotificationDispatchJob.perform_now(first.id)
      PushNotificationDispatchJob.perform_now(last.id)
    end
    assert_equal 1, entries.size
    assert_includes entries.first.last[:body], "2 new messages"
    assert_includes entries.first.last[:body], "Last"
    assert_equal last.metadata["message_id"], entries.first.last.dig(:data, :message_id)
  end

  test "muting a conversation before the delayed job prevents delivery" do
    notification = make_notification("Hello")
    @membership.mute!(1.hour.from_now)
    assert_no_difference "PushDelivery.count" do
      PushNotificationDispatchJob.perform_now(notification.id)
    end
  end

  test "a call alert cannot replace a pending group message" do
    notification = make_notification("Group update")
    Notification.create!(recipient: @recipient, actor: @actor, notifiable: @actor,
      action: "missed_audio_call", metadata: { conversation_id: @conversation.id, call_session_id: 91 })
    entries = []
    dispatcher = Object.new
    dispatcher.define_singleton_method(:call) { |batch| entries.concat(batch) }
    PushNotifications::DeliveryDispatcher.stub(:new, -> { dispatcher }) do
      PushNotificationDispatchJob.perform_now(notification.id)
    end
    assert_equal 1, entries.size
    assert_equal "group", entries.first.last.dig(:data, :conversation_type)
    assert_equal "chat_message_actions", entries.first.last[:categoryId]
  end

  test "a personal message remains actionable without a request workspace" do
    @conversation.update!(conversation_type: "direct", title: nil)
    notification = make_notification("Personal update")
    Current.reset_all
    entries = []
    dispatcher = Object.new
    dispatcher.define_singleton_method(:call) { |batch| entries.concat(batch) }
    PushNotifications::DeliveryDispatcher.stub(:new, -> { dispatcher }) do
      PushNotificationDispatchJob.perform_now(notification.id)
    end
    assert_equal "direct", entries.first.last.dig(:data, :conversation_type)
    assert_equal "chat_message_actions", entries.first.last[:categoryId]
    assert_equal "high", entries.first.last[:priority]
  end

  test "deleting a message before the delayed job prevents delivery" do
    notification = make_notification("Hello")
    notification.notifiable.update!(deleted_at: Time.current, body: "")
    assert_no_difference "PushDelivery.count" do
      PushNotificationDispatchJob.perform_now(notification.id)
    end
  end

  test "a background job delivers chat without a request workspace" do
    notification = make_notification("Background message")
    Current.reset_all
    entries = []
    dispatcher = Object.new
    dispatcher.define_singleton_method(:call) { |batch| entries.concat(batch) }
    PushNotifications::DeliveryDispatcher.stub(:new, -> { dispatcher }) do
      PushNotificationDispatchJob.perform_now(notification.id)
    end
    assert_equal 1, entries.size
    assert_equal notification.metadata["message_id"], entries.first.last.dig(:data, :message_id)
    assert_nil Current.workspace
  end

  test "removing a group member before the delayed job prevents delivery" do
    notification = make_notification("Private update")
    @membership.update!(removed_at: Time.current)
    Current.reset_all
    assert_no_difference "PushDelivery.count" do
      PushNotificationDispatchJob.perform_now(notification.id)
    end
  end

  private

  def make_notification(body)
    message = @conversation.messages.create!(user: @actor, body: body)
    Notification.unscoped.find_by!(recipient: @recipient, notifiable: message)
  end
end
