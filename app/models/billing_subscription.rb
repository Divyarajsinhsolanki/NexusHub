class BillingSubscription < ApplicationRecord
  belongs_to :workspace
  validates :provider, inclusion: { in: %w[stripe razorpay] }
  validates :plan_key, inclusion: { in: %w[growth enterprise] }
  validates :workspace_id, uniqueness: true

  TERMINAL = %w[canceled cancelled completed expired incomplete_expired].freeze

  def terminal?
    TERMINAL.include?(status)
  end

  def entitled?
    %w[active trialing].include?(status) && current_period_end.present? && current_period_end > Time.current
  end

  def public_payload
    slice(:provider, :plan_key, :status, :cancel_at_period_end, :current_period_end, :last_synced_at)
  end
end
