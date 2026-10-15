class Api::CsrfController < Api::BaseController
  skip_before_action :authenticate_user!, :require_privileged_mfa!, :enforce_demo_read_only!
  def show
    token = form_authenticity_token
    response.set_header("X-CSRF-Token", token)
    render json: { csrf_token: token }
  end
end
