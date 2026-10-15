class Api::MfaController < Api::BaseController
  before_action :require_security_session!
  rescue_from PrivilegedMfa::Invalid do |error|
    render json: { error: "mfa_verification_failed", message: error.message }, status: :unprocessable_entity
  end
  after_action { response.set_header("Cache-Control", "no-store") }

  def show
    render json: mfa_payload(current_user).merge(recovery_codes_remaining: current_user.mfa_recovery_digests.size)
  end
  def setup
    render json: PrivilegedMfa.setup!(current_user, authentication_session, password: params[:password])
  end
  def confirm
    codes = PrivilegedMfa.confirm!(current_user, authentication_session, code: params[:otp_code])
    render json: mfa_payload(current_user).merge(recovery_codes: codes)
  end
  def verify
    PrivilegedMfa.verify!(current_user, authentication_session, code: params[:otp_code])
    render json: mfa_payload(current_user)
  end
  def recovery
    render json: { recovery_codes: PrivilegedMfa.regenerate!(current_user, authentication_session, password: params[:password]) }
  end
  def destroy
    PrivilegedMfa.disable!(current_user, authentication_session, password: params[:password])
    render json: mfa_payload(current_user)
  end
  private
  def require_security_session!
    return if authentication_session && authentication_session.user_id == current_user.id && !authentication_session.try(:impersonating?)
    render json: { error: "fresh_session_required" }, status: :forbidden
  end
end
