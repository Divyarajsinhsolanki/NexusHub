class PasswordResetEmailDelivery
  LOG_PREFIX = "[PasswordResetEmail]".freeze

  def self.call(user:)
    new(user:).call
  end

  def initialize(user:)
    @user = user
  end

  def call
    # Devise::Recoverable generates and persists the reset token, builds
    # Devise.mailer.reset_password_instructions, and calls deliver_now.
    log(:info, "mailer invoked mailer=#{Devise.mailer} delivery=deliver_now job_queued=false")
    @user.send_reset_password_instructions
    log(:info, "delivery succeeded mailer=#{Devise.mailer} delivery=deliver_now job_queued=false")
    true
  rescue StandardError => error
    log(
      :error,
      "delivery failed mailer=#{Devise.mailer} delivery=deliver_now job_queued=false " \
      "exception_class=#{error.class.name} exception_message=#{safe_exception_message(error.message)}"
    )
    false
  end

  private

  def log(level, message)
    Rails.logger.public_send(level, "#{LOG_PREFIX} #{message}")
  end

  # SMTP failures can include a recipient address or a URL containing a reset
  # token. Keep the actionable exception message while ensuring those values
  # never reach production logs.
  def safe_exception_message(message)
    message.to_s
      .gsub(%r{([a-z][a-z0-9+.-]*://)[^\s@]+@}i, "\\1[FILTERED_CREDENTIALS]@")
      .gsub(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i, "[FILTERED_EMAIL]")
      .gsub(/((?:reset_)?token|password|credential|authorization)=([^\s&]+)/i, "\\1=[FILTERED]")
      .truncate(500)
  end
end
