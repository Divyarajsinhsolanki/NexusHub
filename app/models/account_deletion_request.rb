class AccountDeletionRequest < ApplicationRecord
  belongs_to :user
  validates :status, inclusion: { in: %w[verification_pending scheduled cancelled blocked completed] }
  validates :receipt_id, presence: true
  scope :due, -> { where(status: 'scheduled').where('delete_after <= ?', Time.current) }
end
