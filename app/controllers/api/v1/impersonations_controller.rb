class Api::V1::ImpersonationsController < Api::V1::BaseController
  before_action :require_owner_session!

  def create
    target = authenticated_mobile_user.workspace.users.find(params.require(:user_id))
    return render_error(code: "invalid_impersonation", message: "Choose another active user.", status: :unprocessable_entity) if target == authenticated_mobile_user || target.locked?

    current_mobile_session.update!(impersonated_user: target)
    log_impersonation("started", target)
    render_access(target)
  end

  def destroy
    target = current_mobile_session.impersonated_user
    current_mobile_session.update!(impersonated_user: nil)
    log_impersonation("stopped", target)
    render_access(authenticated_mobile_user)
  end

  private

  def require_owner_session!
    owner = authenticated_mobile_user
    return if current_mobile_session && owner&.owner?

    render_error(code: "forbidden", message: "Only workspace owners can impersonate users.", status: :forbidden)
  end

  def render_access(user)
    access = MobileAccessToken.issue(current_mobile_session.reload)
    render_data(
      {
        user: serialize_user(user),
        access_token: access.fetch(:token),
        access_token_expires_at: access.fetch(:expires_at).to_i,
        impersonating: current_mobile_session.impersonating?
      }
    )
  end

  def log_impersonation(action, target)
    AppEventLogger.info(
      :application_errors,
      source: "Api::V1::ImpersonationsController##{action_name}",
      message: "Mobile impersonation #{action}",
      payload: {
        owner_id: authenticated_mobile_user.id,
        target_user_id: target&.id,
        mobile_session_id: current_mobile_session.id,
        request_id: request.request_id
      }
    )
  end
end
