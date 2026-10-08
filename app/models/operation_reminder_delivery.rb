class OperationReminderDelivery < ApplicationRecord
  include WorkspaceScoped
  belongs_to :project
  belongs_to :source, polymorphic: true
  belongs_to :recipient, class_name: 'User'
  belongs_to :notification, optional: true
  validates :channel, inclusion: { in: %w[in_app email] }
  validates :state, inclusion: { in: %w[pending processing sent failed skipped cancelled] }
  validates :send_at, :schedule_revision, presence: true
  validate :valid_source

  private

  def valid_source
    unless source.is_a?(ProjectDeployment) || (source.is_a?(ProjectOperationItem) && source.kind == 'license')
      errors.add(:source, 'must be a deployment or licence')
      return
    end
    errors.add(:source, 'must belong to this project and workspace') unless source.project_id == project_id && source.workspace_id == workspace_id
  end
end
