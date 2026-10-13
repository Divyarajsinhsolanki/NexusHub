module Billing
  class Webhook
    def self.call(provider:, raw_body:, signature:, event_id: nil)
      client = Provider.new(provider)
      event = client.verify_event(raw_body, signature)
      id = provider == "stripe" ? event["id"] : event_id
      type = provider == "stripe" ? event["type"] : event["event"]
      raise InvalidSignature, "Missing webhook event identity." if !id.is_a?(String) || id.blank? || !type.is_a?(String) || type.blank?
      receipt = BillingWebhookEvent.find_or_create_by!(provider: provider, event_id: id) { |row| row.event_type = type }
      receipt.with_lock do
        return if receipt.processed_at
        subscription, external_id = find_subscription(provider, event, type)
        if subscription
          workspace = subscription.workspace
          workspace.with_lock do
            subscription.reload
            raise Error, "Subscription identity changed." if subscription.external_id.present? && subscription.external_id != external_id
            subscription.update!(external_id: external_id) if subscription.external_id.blank?
            remote = client.fetch_subscription(subscription.external_id)
            Lifecycle.new(workspace).sync_locked!(subscription, remote)
          end
        end
        receipt.update!(processed_at: Time.current)
      end
    end

    def self.find_subscription(provider, event, type)
      if provider == "stripe"
        object = event.dig("data", "object") || {}
        id = if type.start_with?("customer.subscription.")
          object["id"]
        elsif type.start_with?("checkout.session.")
          object["subscription"]
        elsif type.start_with?("invoice.")
          object["subscription"] || object.dig("parent", "subscription_details", "subscription")
        end
        return unless id.is_a?(String) && id.present?
        subscription = BillingSubscription.find_by(provider: provider, external_id: id)
        if subscription.nil? && type.start_with?("customer.subscription.")
          subscription = BillingSubscription.find_by(provider: provider, attempt_key: object.dig("metadata", "attempt_id"), workspace_id: object.dig("metadata", "workspace_id"), customer_id: object["customer"]) if object.dig("metadata", "attempt_id").present?
        end
        if subscription.nil? && type == "checkout.session.completed"
          subscription = BillingSubscription.find_by(provider: provider, checkout_id: object["id"], customer_id: object["customer"])
        end
        [subscription, id]
      else
        entity = event.dig("payload", "subscription", "entity")
        return unless type.start_with?("subscription.") && entity.is_a?(Hash) && entity["id"].is_a?(String) && entity["id"].present?
        subscription = BillingSubscription.find_by(provider: provider, external_id: entity["id"])
        if subscription.nil? && entity.dig("notes", "attempt_id").present?
          subscription = BillingSubscription.find_by(provider: provider, attempt_key: entity.dig("notes", "attempt_id"), workspace_id: entity.dig("notes", "workspace_id"))
        end
        [subscription, entity["id"]]
      end
    end
  end
end
