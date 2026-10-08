class ProjectOperationChange < ApplicationRecord
  include WorkspaceScoped

  METADATA_FIELDS = %w[fields item_id environment_id deployment_id series_id count source revision expiry_date_before expiry_date_after time_zone_before time_zone_after].freeze

  belongs_to :project
  belongs_to :actor, class_name: "User", optional: true

  validates :action, presence: true
  validates :reason, length: { maximum: 500 }
  validate :safe_metadata
  before_update :reject_changes

  private

  def safe_metadata
    unless metadata.is_a?(Hash) && (metadata.keys - METADATA_FIELDS).empty?
      errors.add(:metadata, "contains unsupported fields")
      return
    end
    metadata.each do |field, value|
      valid = if field == "fields"
        value.is_a?(Array) && value.all? { |name| Operations::Mutation::AUDIT_FIELDS.include?(name) }
      elsif field.end_with?("_id") || field.in?(%w[count revision])
        value.nil? || (value.is_a?(Integer) && value >= 0)
      else
        value.nil? || (value.is_a?(String) && value.length <= 100)
      end
      errors.add(:metadata, "#{field} is invalid") unless valid
    end
  end

  def reject_changes
    errors.add(:base, "Operation history is append-only")
    throw :abort
  end
end
