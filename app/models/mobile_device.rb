class MobileDevice < ApplicationRecord
  PLATFORMS = %w[android ios].freeze

  belongs_to :user
  belongs_to :workspace

  validates :expo_push_token, presence: true, uniqueness: true
  validates :platform, inclusion: { in: PLATFORMS }
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
