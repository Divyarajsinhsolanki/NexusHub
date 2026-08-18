class Task < ApplicationRecord
  include UserStampable
  include WorkspaceScoped

  belongs_to :sprint, optional: true, inverse_of: :tasks
  belongs_to :developer, class_name: 'User', optional: true, inverse_of: :developed_tasks
  belongs_to :project, optional: true, inverse_of: :tasks
  belongs_to :assigned_user, class_name: 'User', foreign_key: :assigned_to_user, optional: true, inverse_of: :tasks

  has_many :task_logs, dependent: :destroy, inverse_of: :task
  has_many :calendar_events, dependent: :nullify

  # This tells ActiveRecord NOT to use the 'type' column for Single Table Inheritance.
  self.inheritance_column = 'non_existent_type_column'

  validates :task_id, presence: true, unless: :general?
  validates :developer, presence: true, unless: :general?
  validates :type, presence: true
  validates :title, presence: true, if: :general?

  before_validation :assign_tail_order, on: :create
  after_commit :notify_assigned_user, on: :create
  after_commit :notify_assigned_user_change, on: :update
  after_commit :notify_relevant_update, on: :update

  NOTIFIABLE_UPDATE_FIELDS = %w[status priority start_date end_date].freeze

  private

  def general?
    type == 'general' || type == 'qa'
  end

  def assign_tail_order
    return if order.present? && order.to_i.positive?

    self.order = next_order_in_assignment_group
  end

  def next_order_in_assignment_group
    group = self.class.unscoped.where(workspace_id: workspace_id)
    group = group.where(project_id: project_id)
    group = group.where(sprint_id: sprint_id)

    if developer_id.present?
      group = group.where(developer_id: developer_id)
    elsif qa_assigned.present?
      group = group.where(developer_id: nil, qa_assigned: qa_assigned)
    else
      group = group.where(developer_id: nil, qa_assigned: [nil, ""])
    end

    group.maximum(:order).to_i + 1
  end

  def notify_assigned_user
    return unless assigned_user

    actor_id = notification_actor_id(created_by)
    return unless actor_id && actor_id != assigned_user.id

    Notification.create(
      recipient: assigned_user,
      actor_id: actor_id,
      action: 'task_assigned',
      notifiable: self,
      metadata: notification_metadata
    )
  end

  def notify_assigned_user_change
    previous_assigned_to_user, current_assigned_to_user = previous_changes['assigned_to_user']
    return if previous_assigned_to_user == current_assigned_to_user
    return if current_assigned_to_user.blank?

    recipient = workspace.users.find_by(id: current_assigned_to_user)
    return unless recipient

    actor_id = notification_actor_id(updated_by)
    return unless actor_id && actor_id != recipient.id

    Notification.create(
      recipient: recipient,
      actor_id: actor_id,
      action: 'task_assigned',
      notifiable: self,
      metadata: notification_metadata
    )
  end

  def notify_relevant_update
    changed_fields = previous_changes.keys & NOTIFIABLE_UPDATE_FIELDS
    return if changed_fields.empty? || assigned_user.blank? || previous_changes.key?("assigned_to_user")

    actor_id = notification_actor_id(updated_by)
    return unless actor_id && actor_id != assigned_user.id

    Notification.create(
      recipient: assigned_user,
      actor_id: actor_id,
      action: "task_updated",
      notifiable: self,
      metadata: notification_metadata.merge(change_summary: task_change_summary(changed_fields))
    )
  end

  def notification_metadata
    {
      task_id: id,
      task_key: task_id,
      task_title: title.presence || task_id.presence || "Task #{id}",
      project_id: project_id
    }
  end

  def task_change_summary(changed_fields)
    labels = { "start_date" => "start date", "end_date" => "due date" }
    changed_fields.map do |field|
      _previous, current = previous_changes.fetch(field)
      label = labels.fetch(field, field.humanize.downcase)
      current.present? ? "#{label} changed to #{current}" : "#{label} cleared"
    end.join(", ")
  end

  def notification_actor_id(default_id)
    default_id || Current.user&.id || created_by
  end
end
