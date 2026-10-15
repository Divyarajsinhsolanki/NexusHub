class TeamUser < ApplicationRecord
  include WorkspaceScoped

  belongs_to :team, inverse_of: :team_users
  belongs_to :user, inverse_of: :team_users

  enum :role, {
    admin: 'admin',
    member: 'member',
    viewer: 'viewer'
  }, default: 'member'

  enum :status, {
    invited: 'invited',
    requested: 'requested',
    accepted: 'accepted',
    rejected: 'rejected',
    pending: 'pending'
  }, default: 'pending'

  after_create_commit :notify_member

  around_save :require_active_workspace_member, if: -> { status != "rejected" && (new_record? || will_save_change_to_status? || will_save_change_to_user_id?) }

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

  def notify_member
    actor = Current.user
    return unless actor && actor.id != user_id

    Notification.create(
      recipient: user,
      actor: actor,
      action: "team_member_added",
      notifiable: self,
      metadata: { team_id: team_id, team_name: team.name, role: role, status: status }
    )
  end
end
