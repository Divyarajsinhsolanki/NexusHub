module Billing
  class Lifecycle
    def initialize(workspace)
      @workspace = workspace
    end

    def snapshot
      subscription = @workspace.billing_subscription
      {
        mode: Configuration.mode,
        saas: @workspace.saas_plan,
        subscription: subscription&.public_payload,
        providers: Configuration::PROVIDERS.map do |name|
          { key: name, name: name.capitalize, plans: %w[growth enterprise].select { |plan| Configuration.configured?(name, plan) } }
        end
      }
    end

    def checkout(provider:, plan_key:, user:)
      Configuration.plan_id(provider, plan_key)
      Configuration.ensure_configured!(provider, plan_key)
      Configuration.return_url if provider == "stripe"
      subscription = nil
      reuse = false
      @workspace.with_lock do
        subscription = @workspace.billing_subscription
        if subscription && !subscription.terminal?
          if subscription.provider == provider && subscription.plan_key == plan_key && subscription.checkout_url.present? && subscription.status == "pending" && subscription.checkout_expires_at&.future?
            reuse = true
          elsif subscription.provider == "stripe" && ((subscription.status == "checkout_unknown" && subscription.checkout_expires_at&.future?) || (subscription.status == "creating" && subscription.updated_at < 2.minutes.ago && subscription.checkout_expires_at&.future?)) && subscription.plan_key == plan_key && provider == "stripe"
            subscription.update!(status: "creating")
          else
            raise Error, "A subscription or checkout already exists. Refresh its status or manage it before starting another."
          end
        else
          subscription ||= @workspace.build_billing_subscription
          subscription.assign_attributes(provider: provider, plan_key: plan_key, status: "creating", external_id: nil, attempt_key: SecureRandom.uuid, checkout_id: nil, checkout_url: nil, checkout_expires_at: 23.hours.from_now, current_period_end: nil, cancel_at_period_end: false)
          subscription.customer_id = nil if subscription.provider_changed?
          subscription.save!
        end
      end
      return { url: subscription.checkout_url } if reuse

      begin
        attributes = Provider.new(provider).checkout(subscription, user)
        attributes[:checkout_url] = Configuration.safe_checkout_url!(provider, attributes[:checkout_url])
        subscription.with_lock do
          subscription.update!(attributes)
          subscription.update!(status: "pending") if %w[creating checkout_unknown].include?(subscription.status)
        end
        { url: subscription.checkout_url }
      rescue Error
        subscription.update!(status: "checkout_unknown") if subscription.reload.status == "creating"
        raise
      end
    end

    def refresh
      subscription = @workspace.billing_subscription
      return snapshot unless subscription
      @workspace.with_lock do
        subscription.reload
        id = subscription.external_id
        if id.blank? && subscription.provider == "stripe" && subscription.checkout_url.present?
          id = Provider.new("stripe").subscription_from_checkout(subscription.checkout_id)
        end
        if id.present?
          subscription.update!(external_id: id) if subscription.external_id.blank?
          sync_locked!(subscription, Provider.new(subscription.provider).fetch_subscription(id))
        elsif subscription.status == "pending" && subscription.checkout_expires_at&.past?
          subscription.update!(status: "expired")
        end
      end
      snapshot
    end

    def cancel
      refresh
      subscription = @workspace.billing_subscription
      raise Error, "No subscription is available to cancel." unless subscription && !subscription.terminal?
      @workspace.with_lock do
        subscription.reload
        provider = Provider.new(subscription.provider)
        if subscription.external_id.blank?
          raise Error, "The checkout result is uncertain. Contact support before retrying." unless subscription.provider == "stripe" && subscription.checkout_url.present?
          provider.expire_checkout(subscription.checkout_id)
          subscription.update!(status: "expired", checkout_url: nil)
        else
          response = provider.cancel(subscription)
          sync_locked!(subscription, response)
          subscription.update!(cancel_at_period_end: true) unless subscription.terminal?
        end
      end
      snapshot
    end

    def portal
      subscription = @workspace.billing_subscription
      raise Error, "No subscription is available." unless subscription
      url = Provider.new(subscription.provider).portal(subscription)
      { url: Configuration.safe_checkout_url!(subscription.provider, url) }
    end

    # Call inside the workspace transaction, fetching authoritative state there
    # so duplicate/out-of-order webhook delivery cannot regress local state.
    def sync_locked!(subscription, remote)
      raise Error, "Invalid subscription response." unless remote.is_a?(Hash) && remote["status"].is_a?(String) && remote["status"].present?
      raise Error, "Subscription identity mismatch." unless remote["id"] == subscription.external_id
      if subscription.provider == "stripe"
        raise Error, "Subscription customer mismatch." unless remote["customer"] == subscription.customer_id
        prices = remote.dig("items", "data").to_a.map { |item| item.dig("price", "id") }.uniq
        raise Error, "Unexpected subscription items." unless prices.length == 1 && prices.first.present?
        plan = %w[growth enterprise].find { |key| Configuration.plan_id("stripe", key) == prices.first }
        period_end = remote["current_period_end"] || remote.dig("items", "data", 0, "current_period_end")
        canceling = remote["cancel_at_period_end"] == true || remote["cancel_at"].present?
      else
        raise Error, "Subscription workspace mismatch." unless remote.dig("notes", "workspace_id") == @workspace.id.to_s
        plan = %w[growth enterprise].find { |key| Configuration.plan_id("razorpay", key).present? && Configuration.plan_id("razorpay", key) == remote["plan_id"] }
        period_end = remote["current_end"]
        canceling = subscription.cancel_at_period_end
      end
      raise Error, "The subscription plan is not recognized." unless plan
      subscription.update!(plan_key: plan, status: remote.fetch("status"), current_period_end: period_end.present? ? Time.at(period_end.to_i) : nil, cancel_at_period_end: canceling, last_synced_at: Time.current)
      @workspace.update!(
        plan_key: subscription.entitled? ? plan : "starter",
        billing_status: subscription.entitled? ? (subscription.status == "trialing" ? "trialing" : "active") : (subscription.terminal? ? "canceled" : "past_due"),
        trial_ends_at: subscription.status == "trialing" && remote["trial_end"].present? ? Time.at(remote["trial_end"].to_i) : nil
      )
    end
  end
end
