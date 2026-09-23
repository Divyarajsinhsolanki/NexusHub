if Rails.env.production?
  Rails.application.config.after_initialize do
    if ENV.fetch("EMAIL_DELIVERY_METHOD", ENV["SMTP_ADDRESS"].present? ? "smtp" : "postmark") == "smtp"
      missing_variables = %w[SMTP_ADDRESS SMTP_USERNAME SMTP_PASSWORD MAILER_SENDER].select { |name| ENV[name].blank? }
    else
      missing_variables = %w[POSTMARK_SERVER_TOKEN MAILER_SENDER].select { |name| ENV[name].blank? }
    end

    if missing_variables.any?
      Rails.logger.warn("Production email is not configured; missing #{missing_variables.join(', ')}")
    end
  end
end
