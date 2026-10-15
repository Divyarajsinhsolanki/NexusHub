class WorkspaceInvitationMailJob < ApplicationJob
  queue_as :mailers

  def perform(id, encrypted_token)
    invitation = WorkspaceInvitation.unscoped.find_by(id: id)
    return unless invitation
    raw = WorkspaceInvitation.decrypt_token(encrypted_token)
    invitation.with_lock do
      return unless invitation.token_valid?(raw)
      WorkspaceInvitationMailer.invitation(invitation.id, encrypted_token).deliver_now
      invitation.update!(delivery_status: "sent")
    end
  rescue StandardError
    if invitation && raw
      invitation.with_lock do
        invitation.update!(delivery_status: "failed") if invitation.token_valid?(raw)
      end
    end
    raise
  end
end
