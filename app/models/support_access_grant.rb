class SupportAccessGrant < ApplicationRecord
  belongs_to :workspace
  belongs_to :approved_by, class_name: "User", optional: true
  belongs_to :support_user, class_name: "User", optional: true
  RESOURCES = %w[projects teams departments].freeze
  validates :reason, length: { minimum: 10, maximum: 1000 }
  validates :expires_at, presence: true
  validate on: :create do
    errors.add(:resources, "choose approved read-only resources") unless resources.is_a?(Array) && resources.any? && (resources - RESOURCES).empty?
    errors.add(:approved_by, "must be the company's active owner") unless approved_by&.workspace_id == workspace_id && approved_by&.owner?
    errors.add(:support_user, "must be an active platform administrator with MFA") unless support_user&.site_admin? && support_user&.workspace_access? && support_user&.mfa_enabled_at
  end
  def usable?
    revoked_at.nil? && expires_at.future? && approved_by&.workspace_access?(workspace) && approved_by.owner? && support_user&.site_admin? && support_user.workspace_access? && support_user.mfa_enabled_at
  end
end
