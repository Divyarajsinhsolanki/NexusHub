require "test_helper"

class PushNotifications::DeliveryDispatcherTest < ActiveSupport::TestCase
  setup do
    @workspace = Workspace.create!(name: "Dispatcher", slug: "dispatcher", kind: "private")
    @recipient = create_test_user(workspace: @workspace, email: "dispatcher@example.test")
  end

  def make_delivery(index)
    device = MobileDevice.create!(workspace: @workspace, user: @recipient, platform: "android", expo_push_token: "ExponentPushToken[dispatcher-#{index}]")
    PushDelivery.create!(workspace: @workspace, recipient: @recipient, mobile_device: device, event_type: "assigned", deduplication_key: "dispatcher-#{index}")
  end

  def entry(delivery)
    [delivery, { to: delivery.mobile_device.expo_push_token }]
  end

  class FakeClient
    attr_reader :batch_sizes

    def initialize(&response)
      @response = response || ->(messages) { messages.each_index.map { |index| { "status" => "ok", "id" => "ticket-#{SecureRandom.uuid}" } } }
      @batch_sizes = []
    end

    def send_messages(messages)
      batch_sizes << messages.size
      @response.call(messages)
    end
  end

  test "batches at Expo's one hundred message limit and records tickets" do
    deliveries = 101.times.map { |index| make_delivery(index) }
    client = FakeClient.new

    PushNotifications::DeliveryDispatcher.new(client: client).call(deliveries.map { |delivery| entry(delivery) })

    assert_equal [100, 1], client.batch_sizes
    assert deliveries.all? { |delivery| delivery.status == "ticketed" }
  end

  test "skips already ticketed deliveries and disables unregistered devices" do
    already_sent = make_delivery(1).tap { |delivery| delivery.record_ticket!("existing-ticket") }
    invalid = make_delivery(2)
    client = FakeClient.new do |_messages|
      [{ "status" => "error", "details" => { "error" => "DeviceNotRegistered" }, "message" => "redacted" }]
    end

    PushNotifications::DeliveryDispatcher.new(client: client).call([entry(already_sent), entry(invalid)])

    assert_equal [1], client.batch_sizes
    assert_equal "ticketed", already_sent.status
    assert_equal "DeviceNotRegistered", invalid.last_error_code
    assert_not invalid.mobile_device.reload.active?
  end
  test "a stale job cannot send an old account preview to a reassigned device" do
    delivery = make_delivery(3)
    queued = entry(delivery)
    other = create_test_user(workspace: @workspace, email: "new-device-owner@example.test")
    delivery.mobile_device.update!(user: other)
    client = FakeClient.new
    PushNotifications::DeliveryDispatcher.new(client: client).call([queued])
    assert_empty client.batch_sizes
    assert_equal "queued", delivery.reload.status
  end

  test "disabled and expired-session devices are excluded at send time" do
    disabled = make_delivery(4)
    expired = make_delivery(5)
    entries = [entry(disabled), entry(expired)]
    disabled.mobile_device.disable!
    session, = MobileSession.issue_for!(user: @recipient)
    expired.mobile_device.update!(mobile_session: session)
    session.update!(expires_at: 1.minute.ago)
    client = FakeClient.new
    PushNotifications::DeliveryDispatcher.new(client: client).call(entries)
    assert_empty client.batch_sizes
  end

end
