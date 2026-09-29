class ContactEndpoint
  class << self
    def enabled?
      recaptcha_enabled? && site_key.present? && secret_key.present?
    end

    def site_key
      ENV['VITE_RECAPTCHA_SITE_KEY'].to_s
    end

    def secret_key
      ENV['RECAPTCHA_SECRET_KEY'].to_s
    end

    private

    def recaptcha_enabled?
      ActiveModel::Type::Boolean.new.cast(ENV['RECAPTCHA_ENABLED'])
    end
  end
end
