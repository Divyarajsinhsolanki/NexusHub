class MobileDevice < ApplicationRecord
  PLATFORMS = %w[android ios].freeze

  belongs_to :user
  belongs_to :workspace
  has_many :push_deliveries, dependent: :destroy

  validates :expo_push_token, presence: true, uniqueness: true
  validates :platform, inclusion: { in: PLATFORMS }
  validates :push_schema_version, numericality: { only_integer: true, greater_than_or_equal_to: 1 }
  validate :workspace_matches_user

  scope :active, -> { where(active: true, disabled_at: nil) }

  def disable!
    update!(active: false, disabled_at: Time.current)
  end

  private

  def workspace_matches_user
    return if user.blank? || workspace_id == user.workspace_id

    errors.add(:workspace, "must match the user's workspace")
  end
end
