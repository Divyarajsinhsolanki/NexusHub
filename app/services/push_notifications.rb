module PushNotifications
  module_function

  def v2_enabled?
    default = Rails.env.production? ? "false" : "true"
    ActiveModel::Type::Boolean.new.cast(ENV.fetch("PUSH_V2_ENABLED", default))
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
