module Billing
  class Configuration
    PROVIDERS = %w[stripe razorpay].freeze

    def self.mode
      ENV.fetch("BILLING_MODE", "test")
    end

    def self.plan_id(provider, plan)
      raise Error, "Unsupported payment provider or plan." unless PROVIDERS.include?(provider) && %w[growth enterprise].include?(plan)
      ENV["#{provider.upcase}_#{plan.upcase}_#{provider == 'stripe' ? 'PRICE' : 'PLAN'}_ID"].presence
    end

    def self.configured?(provider, plan = nil)
      return false unless PROVIDERS.include?(provider) && %w[test live].include?(mode)
      credentials = provider == "stripe" ? [ENV["STRIPE_SECRET_KEY"], ENV["STRIPE_WEBHOOK_SECRET"]] : [ENV["RAZORPAY_KEY_ID"], ENV["RAZORPAY_KEY_SECRET"], ENV["RAZORPAY_WEBHOOK_SECRET"], ENV["RAZORPAY_SUBSCRIPTION_CYCLES"]]
      prefix = provider == "stripe" ? "sk_#{mode}_" : "rzp_#{mode}_"
      credentials.all?(&:present?) && credentials.first.start_with?(prefix) && (plan ? plan_id(provider, plan).present? : %w[growth enterprise].any? { |key| plan_id(provider, key).present? })
    end

    def self.ensure_configured!(provider, plan = nil)
      raise NotConfigured, "#{provider.capitalize} billing is not configured for this plan." unless configured?(provider, plan)
    end

    def self.return_url
      base = ENV["BILLING_RETURN_URL"].presence
      uri = URI.parse(base.to_s)
      valid = uri.host.present? && (uri.scheme == "https" || (!Rails.env.production? && uri.scheme == "http")) && uri.userinfo.nil? && uri.query.nil? && uri.fragment.nil?
      raise NotConfigured, "A billing return URL must be configured." unless valid
      base
    rescue URI::InvalidURIError
      raise NotConfigured, "The billing return URL is invalid."
    end

    def self.safe_checkout_url!(provider, value)
      uri = URI.parse(value.to_s)
      hosts = provider == "stripe" ? %w[checkout.stripe.com billing.stripe.com] : %w[rzp.io payments.razorpay.com]
      raise Error, "The provider did not return a valid billing URL." unless uri.scheme == "https" && hosts.include?(uri.host) && uri.userinfo.nil?
      value
    rescue URI::InvalidURIError
      raise Error, "The provider returned an invalid billing URL."
    end
  end
end
