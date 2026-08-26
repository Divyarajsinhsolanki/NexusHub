require "test_helper"

class CallRingingPushNotificationJobTest < ActiveJob::TestCase
  setup do
    @workspace = Workspace.create!(name: "Push Calls", slug: "push-calls", kind: "private")
    Current.workspace = @workspace
    @caller = create_test_user(workspace: @workspace, email: "push-caller@example.test")
    @recipient = create_test_user(workspace: @workspace, email: "push-recipient@example.test")
    @conversation = Conversation.create!(workspace: @workspace, creator: @caller, conversation_type: "direct")
    @conversation.conversation_participants.create!(workspace: @workspace, user: @caller)
    @conversation.conversation_participants.create!(workspace: @workspace, user: @recipient)
    @call = CallSession.create!(workspace: @workspace, conversation: @conversation, initiator: @caller, call_type: "video", status: "ringing", livekit_room_name: "push-room-#{SecureRandom.hex(4)}")
    @call.call_participants.create!(workspace: @workspace, user: @caller, status: "joined")
    @call.call_participants.create!(workspace: @workspace, user: @recipient, status: "ringing")
    @device = MobileDevice.create!(workspace: @workspace, user: @recipient, expo_push_token: "ExponentPushToken[test-call]", platform: "android")
  end

  test "builds a high priority call-only payload with a root deep link" do
    payload = CallRingingPushNotificationJob.new.send(:push_message, @call, @device)

    assert_equal "high", payload.fetch(:priority)
    assert_equal "calls", payload.fetch(:channelId)
    assert_equal "call_ringing", payload.dig(:data, :type)
    assert_equal @call.id, payload.dig(:data, :call_id)
    assert_equal @conversation.id, payload.dig(:data, :conversation_id)
    assert_equal "/call/#{@call.id}?type=video", payload.dig(:data, :deep_link)
    assert_not payload.fetch(:data).key?(:participant_token)
  end

  test "a web acknowledgement does not suppress ringing on the recipient mobile device" do
    @call.call_participants.find_by!(user: @recipient).update!(ring_acknowledged_at: Time.current)

    job = CallRingingPushNotificationJob.new
    job.define_singleton_method(:push_message) { |_call, _device, _recipient| throw :push_attempted }
    result = catch(:push_attempted) do
      job.perform(@call.id, @recipient.id)
      :not_attempted
    end

    assert_nil result
  end
end
