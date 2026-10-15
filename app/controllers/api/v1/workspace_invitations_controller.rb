class Api::V1::WorkspaceInvitationsController < Api::WorkspaceInvitationsController
  skip_forgery_protection
  private
  def authentication_user
    bearer_token_user
  end
end
