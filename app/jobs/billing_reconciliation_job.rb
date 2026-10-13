# Webhooks are primary; reconcile periodically after outages or missed delivery.
class BillingReconciliationJob < ApplicationJob
  queue_as :default

  def perform
    BillingSubscription.where.not(status: BillingSubscription::TERMINAL).find_each do |subscription|
      next unless Billing::Configuration.configured?(subscription.provider, subscription.plan_key)
      Current.set(workspace: subscription.workspace) do
        Billing::Lifecycle.new(subscription.workspace).refresh
      end
    rescue Billing::Error => error
      Rails.logger.warn("Billing reconciliation failed for subscription #{subscription.id}: #{error.class.name}")
    end
  end
end
