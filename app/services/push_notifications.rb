module PushNotifications
  module_function

  def v2_enabled?
    # The pipeline is backward compatible: schema-v1 devices still receive the
    # legacy channels. Keep v2 on by default so a missing Render environment
    # variable cannot silently suppress chat/work/social pushes. Operators can
    # explicitly set false for an immediate rollback.
    ActiveModel::Type::Boolean.new.cast(ENV.fetch("PUSH_V2_ENABLED", "true"))
  end

  def report(error, delivery: nil, context: {})
    payload = {
      event_type: delivery&.event_type,
      platform: delivery&.mobile_device&.platform,
      app_version: delivery&.mobile_device&.app_version,
      error_code: delivery&.last_error_code
    }.compact.merge(context)

    Rails.logger.warn("Push notification delivery error: #{error.class}")
    Sentry.capture_exception(error, extra: payload) if defined?(Sentry)
  end
end
