require "test_helper"

class LivekitTokenGeneratorTest < ActiveSupport::TestCase
  setup do
    @previous_url = ENV["LIVEKIT_URL"]
    @previous_key = ENV["LIVEKIT_API_KEY"]
    @previous_secret = ENV["LIVEKIT_API_SECRET"]
    ENV["LIVEKIT_API_KEY"] = "test-key"
    ENV["LIVEKIT_API_SECRET"] = "test-secret"
  end

  teardown do
    ENV["LIVEKIT_URL"] = @previous_url
    ENV["LIVEKIT_API_KEY"] = @previous_key
    ENV["LIVEKIT_API_SECRET"] = @previous_secret
  end

  test "accepts a secure public LiveKit URL in production" do
    ENV["LIVEKIT_URL"] = "wss://nexus-hub.livekit.cloud"

    with_rails_environment("production") do
      assert Chat::LivekitTokenGenerator.configured?
      assert_nil Chat::LivekitTokenGenerator.configuration_error
    end
  end

  test "rejects localhost LiveKit URLs in production" do
    ENV["LIVEKIT_URL"] = "ws://localhost:7880"

    with_rails_environment("production") do
      assert_not Chat::LivekitTokenGenerator.configured?
      assert_equal "LIVEKIT_URL must be a publicly reachable wss:// URL in production",
                   Chat::LivekitTokenGenerator.configuration_error
    end
  end

  test "reports missing credentials" do
    ENV["LIVEKIT_URL"] = nil
    ENV["LIVEKIT_API_SECRET"] = nil

    assert_equal "Missing LIVEKIT_URL, LIVEKIT_API_SECRET",
                 Chat::LivekitTokenGenerator.configuration_error
  end

  private

  def with_rails_environment(name)
    original = Rails.method(:env)
    environment = ActiveSupport::StringInquirer.new(name)
    Rails.singleton_class.define_method(:env) { environment }
    yield
  ensure
    Rails.singleton_class.define_method(:env) { original.call }
  end
end
