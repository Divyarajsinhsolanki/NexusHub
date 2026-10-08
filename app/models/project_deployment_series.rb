class ProjectDeploymentSeries < ApplicationRecord
  include WorkspaceScoped
  include OperationScheduleValidation

  belongs_to :project
  belongs_to :project_environment
  belongs_to :owner, class_name: 'User'
  has_many :project_deployments, dependent: :restrict_with_error

  validates :frequency, inclusion: { in: %w[weekly monthly] }
  validates :local_time, format: { with: /\A(?:[01]\d|2[0-3]):[0-5]\d\z/ }
  validates :starts_on, presence: true
  validate :valid_recurrence

  private

  def valid_recurrence
    errors.add(:ends_on, 'must not precede start') if starts_on && ends_on && ends_on < starts_on
    if frequency == 'weekly'
      errors.add(:weekdays, 'must contain weekdays from 0 (Sunday) to 6') unless weekdays.is_a?(Array) && weekdays.any? && weekdays.all? { |n| n.is_a?(Integer) && n.between?(0, 6) }
    elsif frequency == 'monthly'
      errors.add(:day_of_month, 'must be between 1 and 31') unless day_of_month&.between?(1, 31)
    end
  end
end
