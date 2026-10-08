class Project < ApplicationRecord
  include WorkspaceScoped
  class Forbidden < StandardError; end

  belongs_to :owner, class_name: 'User', optional: true, inverse_of: :owned_projects

  has_many :project_users, dependent: :destroy, inverse_of: :project
  has_many :users, through: :project_users
  has_many :sprints, dependent: :destroy, inverse_of: :project
  has_many :tasks, dependent: :nullify, inverse_of: :project
  has_many :issues, dependent: :destroy, inverse_of: :project
  has_many :developers, -> { distinct }, through: :tasks, source: :developer
  has_many :project_deployments, dependent: :destroy
  has_many :project_deployment_series, dependent: :destroy
  has_many :project_operation_items, dependent: :destroy
  has_many :project_operation_entries, dependent: :destroy
  has_many :project_operation_changes, dependent: :delete_all
  has_many :operation_reminder_deliveries, dependent: :destroy
  has_many :project_environments, dependent: :destroy, inverse_of: :project
  has_many :project_vault_items, dependent: :destroy, inverse_of: :project
  has_many :calendar_events, dependent: :nullify

  enum :status, {
    upcoming: 'upcoming',
    running: 'running',
    completed: 'completed'
  }, default: 'running'

  validates :name, presence: true

  def self.accessible_to(user)
    return none unless user

    workspace_projects = where(workspace_id: user.workspace_id)
    return workspace_projects if user.owner? || user.admin?

    membership_ids = ProjectUser.where(user_id: user.id, status: "active").select(:project_id)
    workspace_projects.where(owner_id: user.id).or(workspace_projects.where(id: membership_ids))
  end

  def editable_by?(user)
    return false unless user && workspace_id == user.workspace_id && !user.demo_account?
    return true if user.owner? || user.admin? || owner_id == user.id

    project_users.where(user_id: user.id, status: 'active').where.not(role: 'viewer').exists?
  end

  def manageable_by?(user)
    return false unless editable_by?(user)
    return true if user.owner? || user.admin? || owner_id == user.id || user.project_manager?

    project_users.where(user_id: user.id, status: 'active', role: %w[owner manager]).exists?
  end

  def authorize_edit!(user)
    self.class.accessible_to(user).find(id)
    raise Forbidden, 'Your project role has read-only access.' unless editable_by?(user)
  end

  def authorize_management!(user)
    self.class.accessible_to(user).find(id)
    raise Forbidden, 'Project management access is required.' unless manageable_by?(user)
  end
  validates :name, uniqueness: { scope: :workspace_id }
  validate :end_date_not_before_start_date

  before_save :set_status_from_dates

  scope :current_running, -> {
    where('start_date IS NULL OR (start_date <= :today AND (end_date IS NULL OR end_date >= :today))', today: Date.current)
  }

  # Dates can advance without a save. Always serialize the current date status.
  def status
    date_status
  end

  def upcoming? = status == 'upcoming'
  def running? = status == 'running'
  def completed? = status == 'completed'

  def self.refresh_date_statuses!
    expression = sanitize_sql_array([<<~SQL.squish, { today: Date.current }])
      CASE WHEN start_date IS NULL THEN 'running'
           WHEN end_date < :today THEN 'completed'
           WHEN start_date > :today THEN 'upcoming'
           ELSE 'running' END
    SQL
    unscoped.where("status IS DISTINCT FROM (#{expression})").update_all("status = (#{expression})")
  end

  private

  def end_date_not_before_start_date
    return if end_date.blank? || start_date.blank?

    if end_date < start_date
      errors.add(:end_date, 'must be on or after the start date')
    end
  end

  def set_status_from_dates
    self.status = date_status
  end

  def date_status
    return 'running' if start_date.blank?
    return 'completed' if end_date.present? && Date.current > end_date
    return 'upcoming' if Date.current < start_date

    'running'
  end
end
