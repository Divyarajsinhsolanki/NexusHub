require 'json'
require 'uri'
module Recovery
  module DeploymentSafety
    def self.validate!(env)
      tier = env.fetch('DEPLOYMENT_TIER', 'production')
      raise 'DEPLOYMENT_TIER must be production, staging or restore.' unless %w[production staging restore].include?(tier)
      return if tier == 'production'
      if tier == 'staging'
        keys = JSON.parse(env.fetch('INTEGRATION_ENCRYPTION_KEYS', '{}'))
        raise 'Staging needs its own valid encryption keyring.' unless keys.is_a?(Hash) && !keys.empty? && keys.values.all? { |value| value.is_a?(String) && value.match?(/\A[0-9a-fA-F]{64}\z/) }
        raise 'Staging needs its own Operations key.' unless env['PROJECT_OPERATIONS_ENCRYPTION_KEY'].to_s.match?(/\A[0-9a-fA-F]{64}\z/)
        %w[SECRET_KEY_BASE DEVISE_JWT_SECRET_KEY].each do |key|
          value = env[key].to_s
          raise 'Staging signing keys must be independently generated, not placeholders.' if value.length < 32 || value.match?(/\A(?:replace|dummy|example|your_)/i)
        end
      end
      uri = URI.parse(env.fetch('DATABASE_URL'))
      name = uri.path.delete_prefix('/')
      required_marker = tier == 'staging' ? /(?:\A|_)staging(?:_|\z)/ : /_restore_[a-z0-9]+\z/
      raise 'Nonproduction database name must identify the isolated tier.' unless name.match?(required_marker)
      raise 'Nonproduction requires explicitly isolated Redis.' unless env['NONPRODUCTION_ISOLATION_CONFIRMED'] == 'true' && env['REDIS_URL'].to_s != ''
      raise 'Nonproduction uploads must use local isolated storage.' unless env['ACTIVE_STORAGE_SERVICE'] == 'local'
      raise 'Nonproduction billing, push, and provider credentials must be absent.' if %w[
        STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET
        POSTMARK_SERVER_TOKEN S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY CLOUDINARY_URL CLOUDINARY_API_SECRET
        AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE
        AWS_WEB_IDENTITY_TOKEN_FILE GOOGLE_APPLICATION_CREDENTIALS SENTRY_DSN VITE_SENTRY_DSN
        LIVEKIT_API_SECRET FIREBASE_PRIVATE_KEY EXPO_ACCESS_TOKEN
      ].any? { |key| !env[key].to_s.empty? }
      raise 'Nonproduction email must be captured locally.' unless env['EMAIL_DELIVERY_METHOD'] == 'smtp' && env['SMTP_ADDRESS'] == 'mailpit'
      raise 'Nonproduction mail sender must use the reserved .invalid domain.' unless env['MAILER_SENDER'].to_s.end_with?('.invalid')
      base = URI.parse(env.fetch('BASE_URL'))
      raise 'Nonproduction BASE_URL must identify staging/restore or localhost.' unless base.host && (base.host.include?(tier) || %w[localhost 127.0.0.1].include?(base.host))
    rescue URI::InvalidURIError, KeyError, JSON::ParserError
      raise 'Nonproduction isolation settings are incomplete or invalid.'
    end
  end
end
