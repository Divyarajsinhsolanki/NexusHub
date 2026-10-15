class Api::V1::WorkspaceOffboardingsController < Api::WorkspaceOffboardingsController
  skip_forgery_protection
  private
  def authentication_user
    bearer_token_user
  end
end
