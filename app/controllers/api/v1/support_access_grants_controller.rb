class Api::V1::SupportAccessGrantsController < Api::SupportAccessGrantsController
  skip_forgery_protection
  private
  def authentication_user
    bearer_token_user
  end
end
