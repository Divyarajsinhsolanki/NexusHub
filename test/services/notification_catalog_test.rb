require "test_helper"
require "ostruct"

class NotificationCatalogTest < ActiveSupport::TestCase
  test "maps legacy actions to canonical events" do
    assert_equal "task_assigned", NotificationCatalog.canonical_event_type("assigned", "Task")
    assert_equal "project_assigned", NotificationCatalog.canonical_event_type("assigned", "ProjectUser")
    assert_equal "chat_mention", NotificationCatalog.canonical_event_type("chat_ping", "Message")
    assert_equal "missed_video_call", NotificationCatalog.canonical_event_type("missed_call", "CallSession", call_type: "video")
  end

  test "provides category identity grouping sanitized previews and exact deep links" do
    notification = OpenStruct.new(
      id: 15,
      action: "chat_message",
      notifiable_type: "Message",
      notifiable_id: 88,
      notifiable: nil,
      metadata: { conversation_id: 7, conversation_name: "Design", message_preview: "<b>Hello</b> " + ("x" * 180) },
      actor: OpenStruct.new(full_name: "Alex")
    )
    catalog = NotificationCatalog.new(notification)

    assert_equal "chat", catalog.category
    assert_equal "nexus_chat_v1", catalog.channel_id
    assert_equal "conversation:7", catalog.group_key
    assert_equal "/chat/7", catalog.deep_link
    assert_not_includes catalog.message, "<b>"
    assert_operator catalog.message.length, :<=, 130
    assert_equal "4 new messages in Design", catalog.message(aggregate_count: 4)
  end

  test "uses call routes and distinct audio and video channels" do
    notification = OpenStruct.new(id: 2, action: "missed_video_call", notifiable_type: "CallSession", notifiable_id: 19, notifiable: nil, metadata: { conversation_id: 7, call_session_id: 19 }, actor: OpenStruct.new(full_name: "Alex"))
    catalog = NotificationCatalog.new(notification)

    assert_equal "video_calls", catalog.category
    assert_equal "nexus_video_calls_v1", catalog.channel_id
    assert_equal "/call/19", catalog.deep_link
  end
end
