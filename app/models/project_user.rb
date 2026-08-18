class ProjectUser < ApplicationRecord
  include UserStampable
  include WorkspaceScoped
  after_create :notify_user

  belongs_to :project, inverse_of: :project_users
  belongs_to :user, inverse_of: :project_users

  enum :role, {
    owner: 'owner',
    manager: 'manager',
    collaborator: 'collaborator',
    developer: 'developer',
    qa: 'qa',
    devops: 'devops',
    designer: 'designer',
    analyst: 'analyst',
    viewer: 'viewer'
  }, default: 'collaborator'

  enum :status, {
    invited: 'invited',
    requested: 'requested',
    active: 'active',
    removed: 'removed'
  }, default: 'active'

  WORKLOAD_STATUSES = %w[free partial full overloaded].freeze

  validates :workload_status, inclusion: { in: WORKLOAD_STATUSES }
  validates :allocation_percentage, numericality: {
    greater_than_or_equal_to: 0,
    less_than_or_equal_to: 100,
    only_integer: true
  }

  private

  def notify_user
    actor_id = Current.user&.id
    return unless actor_id && actor_id != user_id

    Notification.create(
      recipient: user,
      actor_id: actor_id,
      action: 'project_assigned',
      notifiable: self,
      metadata: { project_id: project_id, project_name: project.name, role: role }
    )
  end
end
