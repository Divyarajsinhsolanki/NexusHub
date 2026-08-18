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

  private

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
