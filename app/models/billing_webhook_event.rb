class BillingWebhookEvent < ApplicationRecord
  validates :provider, :event_id, :event_type, presence: true
end
