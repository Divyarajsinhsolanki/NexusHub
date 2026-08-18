require "test_helper"

class PushNotifications::PayloadBuilderTest < ActiveSupport::TestCase
  setup do
    @workspace = Workspace.create!(name: "Push Payloads", slug: "push-payloads", kind: "private")
    Current.workspace = @workspace
    @actor = create_test_user(workspace: @workspace, email: "payload-actor@example.test")
    @recipient = create_test_user(workspace: @workspace, email: "payload-recipient@example.test")
    @notification = Notification.create!(
      recipient: @recipient,
      actor: @actor,
      action: "chat_message",
      notifiable: @actor,
      metadata: { conversation_id: 41, message_id: 73, conversation_name: "Delivery", message_preview: "Private update" }
    )
    @device = MobileDevice.create!(workspace: @workspace, user: @recipient, expo_push_token: "ExponentPushToken[payload]", platform: "android", push_schema_version: 2, app_variant: "preview")
  end

  test "builds schema-v2 grouped actionable payload without exposing credentials" do
    with_push_v2 do
      payload = PushNotifications::PayloadBuilder.new(notification: @notification, device: @device, aggregate_count: 3).call

      assert_equal "nexus_chat_v1", payload[:channelId]
      assert_equal "nexus_chat.wav", payload[:sound]
      assert_equal "chat_message_actions", payload[:categoryId]
      assert_equal "conversation:41", payload[:collapseId]
      assert_equal "3 new messages in Delivery", payload[:body]
      assert_equal 41, payload.dig(:data, :conversation_id)
      assert_equal 73, payload.dig(:data, :message_id)
      assert_equal 2, payload.dig(:data, :schema_version)
      assert_not payload.to_s.include?("participant_token")
      assert_operator JSON.generate(payload).bytesize, :<=, PushNotifications::ExpoClient::MAX_MESSAGE_BYTES
    end
  end

  test "uses privacy-safe text when previews are disabled" do
    @recipient.update!(push_notification_settings: { previews: false })
    with_push_v2 do
      payload = PushNotifications::PayloadBuilder.new(notification: @notification, device: @device).call
      assert_equal "You have new chat activity", payload[:body]
      assert_not_includes payload[:body], "Private update"
    end
  end

  private

  def with_push_v2
    previous = ENV["PUSH_V2_ENABLED"]
    ENV["PUSH_V2_ENABLED"] = "true"
    yield
  ensure
    ENV["PUSH_V2_ENABLED"] = previous
  end
end
