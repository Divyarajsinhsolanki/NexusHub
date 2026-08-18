class PushDelivery < ApplicationRecord
  STATUSES = %w[queued ticketed accepted failed].freeze

  belongs_to :workspace
  belongs_to :recipient, class_name: "User"
  belongs_to :mobile_device
  belongs_to :notification, optional: true
  belongs_to :source, polymorphic: true, optional: true

  validates :event_type, :deduplication_key, presence: true
  validates :deduplication_key, uniqueness: true
  validates :status, inclusion: { in: STATUSES }
  validate :workspace_consistency

  scope :awaiting_receipt, -> { where(status: "ticketed").where.not(expo_ticket_id: nil) }

  def record_ticket!(ticket_id)
    update!(
      status: "ticketed",
      expo_ticket_id: ticket_id,
      attempt_count: attempt_count + 1,
      last_error_code: nil,
      last_error_message: nil,
      sent_at: Time.current
    )
  end

  def record_failure!(code:, message: nil, attempted: true)
    update!(
      status: "failed",
      attempt_count: attempt_count + (attempted ? 1 : 0),
      last_error_code: code.to_s.first(100),
      # Expo messages can echo payload fragments. Persist only the sanitized code.
      last_error_message: nil
    )
  end

  private

  def workspace_consistency
    return if workspace_id.blank?

    errors.add(:recipient, "must belong to the same workspace") if recipient && recipient.workspace_id != workspace_id
    errors.add(:mobile_device, "must belong to the same workspace") if mobile_device && mobile_device.workspace_id != workspace_id
  end
end
