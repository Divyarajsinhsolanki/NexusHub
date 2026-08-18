require "test_helper"

class PushNotifications::DeliveryDispatcherTest < ActiveSupport::TestCase
  FakeDevice = Struct.new(:disabled) do
    def disable! = self.disabled = true
  end

  FakeDelivery = Struct.new(:id, :status, :mobile_device, :ticket, :failure_code) do
    def record_ticket!(value)
      self.ticket = value
      self.status = "ticketed"
    end

    def record_failure!(code:, message: nil, attempted: true)
      self.failure_code = code
      self.status = "failed"
    end
  end

  class FakeClient
    attr_reader :batch_sizes

    def initialize(&response)
      @response = response || ->(messages) { messages.each_index.map { |index| { "status" => "ok", "id" => "ticket-#{index}" } } }
      @batch_sizes = []
    end

    def send_messages(messages)
      batch_sizes << messages.size
      @response.call(messages)
    end
  end

  test "batches at Expo's one hundred message limit and records tickets" do
    deliveries = 101.times.map { |index| FakeDelivery.new(index + 1, "queued", FakeDevice.new(false)) }
    client = FakeClient.new

    PushNotifications::DeliveryDispatcher.new(client: client).call(deliveries.map { |delivery| [delivery, { to: "token" }] })

    assert_equal [100, 1], client.batch_sizes
    assert deliveries.all? { |delivery| delivery.status == "ticketed" }
  end

  test "skips already ticketed deliveries and disables unregistered devices" do
    already_sent = FakeDelivery.new(1, "ticketed", FakeDevice.new(false))
    invalid = FakeDelivery.new(2, "queued", FakeDevice.new(false))
    client = FakeClient.new do |_messages|
      [{ "status" => "error", "details" => { "error" => "DeviceNotRegistered" }, "message" => "redacted" }]
    end

    PushNotifications::DeliveryDispatcher.new(client: client).call([[already_sent, { to: "old" }], [invalid, { to: "invalid" }]])

    assert_equal [1], client.batch_sizes
    assert_equal "ticketed", already_sent.status
    assert_equal "DeviceNotRegistered", invalid.failure_code
    assert invalid.mobile_device.disabled
  end
end
