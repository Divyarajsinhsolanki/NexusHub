class CalendarEvent < ApplicationRecord
  include WorkspaceScoped

  EVENT_TYPES = %w[meeting deadline reminder focus sprint_ceremony].freeze
  RECURRENCE_RULES = %w[none daily weekly monthly].freeze

  belongs_to :user
  belongs_to :project, optional: true
  belongs_to :task, optional: true
  belongs_to :sprint, optional: true
  belongs_to :recurrence_parent, class_name: 'CalendarEvent', optional: true
  belongs_to :operation_source, polymorphic: true, optional: true

  has_many :event_reminders, dependent: :destroy
  has_many :recurrence_instances, class_name: 'CalendarEvent', foreign_key: :recurrence_parent_id, dependent: :nullify

  enum :visibility, {
    personal: 'personal',
    project: 'project'
  }, default: 'personal'

  enum :status, {
    scheduled: 'scheduled',
    cancelled: 'cancelled',
    completed: 'completed'
  }, default: 'scheduled'

  validates :title, :start_at, :end_at, :event_type, :visibility, :status, presence: true
  validates :event_type, inclusion: { in: EVENT_TYPES }
  validates :recurrence_rule, inclusion: { in: RECURRENCE_RULES }, allow_blank: true
  validate :end_after_start
  validate :project_required_for_project_visibility

  scope :within_range, ->(start_time, end_time) {
    where('start_at < ? AND end_at > ?', end_time, start_time)
  }

  def as_api_json
    as_json(
      only: [:id, :title, :description, :start_at, :end_at, :all_day, :event_type, :visibility, :status, :location_or_meet_link, :project_id, :task_id, :sprint_id, :user_id, :created_at, :updated_at, :recurrence_rule, :recurrence_until, :recurrence_parent_id, :external_source, :external_id],
      include: {
        event_reminders: {
          only: [:id, :channel, :minutes_before, :send_at, :sent_at, :state]
        }
      }
    ).merge("managed_operation" => managed_operation?, "operation_path" => operation_path)
  end

  def managed_operation?
    operation_source_type.present?
  end

  def operation_path
    Operations::Schedules.path_for(operation_source) if managed_operation? && operation_source
  end

  # Existing calendar membership includes inactive users. Managed operational
  # records retain their stricter project membership policy in every calendar view.
  scope :operations_visible_to, ->(user) {
    active_projects = ProjectUser.where(user_id: user&.id, status: 'active').select(:project_id)
    where(operation_source_type: nil).or(where(project_id: active_projects))
  }

  def google_event_url
    params = {
      action: 'TEMPLATE',
      text: title,
      dates: "#{start_at.utc.strftime('%Y%m%dT%H%M%SZ')}/#{end_at.utc.strftime('%Y%m%dT%H%M%SZ')}",
      details: description.to_s,
      location: location_or_meet_link.to_s
    }

    "https://calendar.google.com/calendar/render?#{params.to_query}"
  end

  private

  def end_after_start
    return if start_at.blank? || end_at.blank?
    return if end_at >= start_at

    errors.add(:end_at, 'must be on or after start_at')
  end

  def project_required_for_project_visibility
    return unless visibility == 'project' && project_id.blank?

    errors.add(:project_id, 'is required for project events')
  end
end
