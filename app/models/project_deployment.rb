class ProjectDeployment < ApplicationRecord
  include WorkspaceScoped
  include OperationScheduleValidation

  STATUSES = %w[planned in_progress deployed failed cancelled].freeze
  belongs_to :project
  belongs_to :project_environment
  belongs_to :project_deployment_series, optional: true
  belongs_to :owner, class_name: 'User'
  belongs_to :verified_by, class_name: 'User', optional: true
  has_many :operation_reminder_deliveries, as: :source, dependent: :destroy
  has_one :operation_calendar_event, as: :operation_source, class_name: 'CalendarEvent', dependent: :destroy

  validates :scheduled_at, presence: true
  validates :status, inclusion: { in: STATUSES }
  validate :frozen_targets
  validate :valid_observations

  def verification
    targets.map do |target|
      observed = observations.find { |entry| entry['item_id'].to_i == target['item_id'].to_i }
      observed_at = parse_observed_at(observed&.dig('observed_at'))
      state = if observed.nil?
        'unknown'
      elsif deployed_at.nil? || observed_at.nil? || observed_at < deployed_at || observed_at > Time.current
        'stale'
      elsif observed['observed_version'] == target['expected_version']
        'match'
      else
        'mismatch'
      end
      target.merge('observed_version' => observed&.dig('observed_version'), 'observed_at' => observed&.dig('observed_at'), 'status' => state)
    end
  end

  def as_operations_json
    as_json(only: %i[id name project_environment_id project_deployment_series_id owner_id recipient_ids reminder_minutes scheduled_at time_zone status started_at deployed_at verified_at verified_by_id targets observations notes]).merge(
      'verification_status' => verified_at ? 'verified' : 'pending', 'verification' => verification,
      'environment_name' => project_environment.name, 'owner_name' => owner.name
    )
  end

  def operation_path
    Operations::Schedules.path_for(self)
  end

  private

  def frozen_targets
    errors.add(:targets, 'are frozen after deployment starts') if persisted? && status_in_database != 'planned' && will_save_change_to_targets?
    errors.add(:project_deployment_series, 'must belong to this project') if project_deployment_series && project_deployment_series.project_id != project_id
  end

  def valid_observations
    valid = observations.is_a?(Array) && observations.size <= 1_000 && observations.all? do |row|
      row.is_a?(Hash) && targets.any? { |target| target['item_id'].to_s == row['item_id'].to_s } &&
        row['observed_version'].is_a?(String) && row['observed_version'].present? && row['observed_version'].length <= 160 &&
        row['source'].is_a?(String) && row['source'].length <= 80 && parse_observed_at(row['observed_at'])
    end
    errors.add(:observations, 'must reference deployment targets and valid recorded versions') unless valid
  end

  def parse_observed_at(value)
    Time.iso8601(value) if value.is_a?(String)
  rescue ArgumentError
    nil
  end
end
