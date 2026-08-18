class Issue < ApplicationRecord
  include WorkspaceScoped

  belongs_to :project
  belongs_to :reporter, class_name: 'User', optional: true
  belongs_to :assignee_user, class_name: 'User', optional: true

  STATUSES = [
    'New',
    'In Progress',
    'Blocked',
    'Resolved',
    'Not Reproducible',
    'Need to discuss',
    'Retest',
    'Not an issue'
  ].freeze

  SEVERITIES = %w[Low Medium High Critical].freeze

  # QA Testing status options
  QA_STATUSES = %w[Y N].freeze

  has_many_attached :media_files

  validates :issue_key, presence: true, uniqueness: { scope: :workspace_id }
  validates :title, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :severity, inclusion: { in: SEVERITIES }

  before_validation :ensure_issue_key
  before_validation :normalize_status_and_severity
  after_commit :notify_assignment_or_status_change, on: %i[create update]

  private

  def ensure_issue_key
    self.issue_key ||= "ISS-#{SecureRandom.hex(3).upcase}"
  end

  def normalize_status_and_severity
    self.status = canonical_enum_value(status, STATUSES, 'New')
    self.severity = canonical_enum_value(severity, SEVERITIES, 'Medium')
  end

  def canonical_enum_value(value, allowed_values, fallback)
    normalized = value.to_s.strip
    return fallback if normalized.blank?

    allowed_values.find { |allowed_value| enum_key(allowed_value) == enum_key(normalized) } || normalized
  end

  def enum_key(value)
    value.to_s.tr('_-', ' ').squish.downcase
  end

  def notify_assignment_or_status_change
    return unless saved_change_to_assignee? || saved_change_to_assignee_user_id? || saved_change_to_status?

    previous_status = saved_change_to_status? ? saved_change_to_status.first : nil
    previous_assignee = saved_change_to_assignee? ? saved_change_to_assignee.first : nil
    IssueNotifierJob.perform_later(id, previous_status, previous_assignee)
    notify_mobile_recipients(previous_status)
  end

  def notify_mobile_recipients(previous_status)
    actor = Current.user
    return unless actor

    assignment_changed = saved_change_to_assignee_user_id?
    if assignment_changed && assignee_user && assignee_user_id != actor.id
      Notification.create(
        recipient: assignee_user,
        actor: actor,
        action: "issue_assigned",
        notifiable: self,
        metadata: issue_notification_metadata
      )
    end

    return if previously_new_record? || !saved_change_to_status?

    [reporter, assignee_user].compact.uniq.each do |recipient|
      next if recipient.id == actor.id
      next if assignment_changed && recipient.id == assignee_user_id

      Notification.create(
        recipient: recipient,
        actor: actor,
        action: "issue_updated",
        notifiable: self,
        metadata: issue_notification_metadata.merge(previous_status: previous_status, status: status)
      )
    end
  end

  def issue_notification_metadata
    {
      issue_id: id,
      issue_key: issue_key,
      issue_title: title,
      project_id: project_id,
      status: status
    }
  end
end
