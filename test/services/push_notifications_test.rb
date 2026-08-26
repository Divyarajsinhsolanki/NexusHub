require "test_helper"

class PushNotificationsTest < ActiveSupport::TestCase
  setup do
    @previous_push_v2 = ENV.delete("PUSH_V2_ENABLED")
  end

  teardown do
    ENV["PUSH_V2_ENABLED"] = @previous_push_v2
  end

  test "v2 delivery is enabled when deployment does not define the rollout flag" do
    assert PushNotifications.v2_enabled?
  end

  test "an explicit false value remains an immediate rollback" do
    ENV["PUSH_V2_ENABLED"] = "false"

    assert_not PushNotifications.v2_enabled?
  end
end
