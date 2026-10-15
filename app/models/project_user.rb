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

  around_save :require_active_workspace_member, if: -> { status != "removed" && (new_record? || will_save_change_to_status? || will_save_change_to_user_id?) }

  private

  def require_active_workspace_member
    workspace.with_lock do
      unless user.workspace_access?(workspace)
        errors.add(:user, "must have active workspace access")
        raise ActiveRecord::RecordInvalid, self
      end
      yield
    end
  end

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
