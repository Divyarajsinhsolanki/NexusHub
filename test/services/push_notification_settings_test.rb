require "test_helper"

class PushNotificationSettingsTest < ActiveSupport::TestCase
  test "normalizes independent category and privacy preferences" do
    settings = PushNotificationSettings.normalize(
      enabled: "true",
      previews: "false",
      categories: { chat: false, work: true, unsupported: false },
      quiet_hours: { enabled: true, start: "22:00", end: "07:00", timezone: "Asia/Kolkata", allow_calls: false }
    )

    assert settings["enabled"]
    assert_not settings["previews"]
    assert_not settings.dig("categories", "chat")
    assert settings.dig("categories", "video_calls")
    assert_not settings.dig("quiet_hours", "allow_calls")
    assert_equal "Asia/Kolkata", settings.dig("quiet_hours", "timezone")
  end

  test "calculates quiet hours across midnight in the phone timezone" do
    settings = { quiet_hours: { enabled: true, start: "22:00", end: "07:00", timezone: "Asia/Kolkata" } }
    during = Time.utc(2026, 8, 18, 19, 0) # 00:30 in Kolkata
    after = Time.utc(2026, 8, 19, 4, 0) # 09:30 in Kolkata

    period = PushNotificationSettings.quiet_period(settings, now: during)
    assert period
    assert_operator period[:starts_at], :<, during
    assert_operator period[:ends_at], :>, during
    assert_nil PushNotificationSettings.quiet_period(settings, now: after)
  end
end
