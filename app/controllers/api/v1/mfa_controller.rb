class Api::V1::MfaController < Api::MfaController
  skip_forgery_protection
  private
  def authentication_user
    bearer_token_user
  end
end
