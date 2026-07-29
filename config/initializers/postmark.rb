if Rails.env.production?
  Rails.application.config.after_initialize do
    missing_variables = %w[POSTMARK_SERVER_TOKEN MAILER_SENDER].select { |name| ENV[name].blank? }
    if missing_variables.any?
      Rails.logger.warn("Production email is not configured; missing #{missing_variables.join(', ')}")
    end
  end
end
