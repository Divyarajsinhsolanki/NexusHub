class Project < ApplicationRecord
  include WorkspaceScoped

  belongs_to :owner, class_name: 'User', optional: true, inverse_of: :owned_projects

  has_many :project_users, dependent: :destroy, inverse_of: :project
  has_many :users, through: :project_users
  has_many :sprints, dependent: :destroy, inverse_of: :project
  has_many :tasks, dependent: :nullify, inverse_of: :project
  has_many :issues, dependent: :destroy, inverse_of: :project
  has_many :developers, -> { distinct }, through: :tasks, source: :developer
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
  validates :name, uniqueness: { scope: :workspace_id }
  validate :end_date_not_before_start_date

  before_save :set_status_from_dates

  private

  def end_date_not_before_start_date
    return if end_date.blank? || start_date.blank?

    if end_date < start_date
      errors.add(:end_date, 'must be on or after the start date')
    end
  end

  def set_status_from_dates
    return self.status = 'running' if start_date.blank?

    if end_date.present? && Date.current > end_date
      self.status = 'completed'
    elsif Date.current < start_date
      self.status = 'upcoming'
    else
      self.status = 'running'
    end
  end
end
