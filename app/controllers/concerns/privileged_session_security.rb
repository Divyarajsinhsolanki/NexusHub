module PrivilegedSessionSecurity
  extend ActiveSupport::Concern

  def authentication_session
    return current_mobile_session if respond_to?(:current_mobile_session) && current_mobile_session
    @security_web_session ||= WebSession.authenticate(cookies.signed[:access_token], type: "web_access")
  end

  def mfa_payload(user)
    { required: PrivilegedMfa.required?(user), enabled: user.mfa_enabled_at.present?,
      verified: PrivilegedMfa.verified?(user, authentication_session),
      recent: PrivilegedMfa.verified?(user, authentication_session, recent: true) }
  end

  def require_privileged_mfa!
    return unless @current_user
    return if controller_name == "mfa" || (controller_name == "me" && action_name == "show")
    return if controller_name == "auth" && %w[session_info me logout].include?(action_name)
    return unless PrivilegedMfa.required?(current_user) || current_user&.mfa_enabled_at
    if PrivilegedMfa.verified?(current_user, authentication_session)
      sensitive = %w[
        admin portfolio portfolio_admin billing workspace_memberships workspace_invitations workspace_offboardings
        users projects teams departments department_workflows team_users project_users project_environments
        workspace_integrations project_operations project_deployments project_vault_items account passwords keka support_access_grants
      ]
      return require_recent_mfa! if PrivilegedMfa.required?(current_user) && sensitive.include?(controller_name) && !(request.get? || request.head?)
      return
    end
    render json: { error: "mfa_required", message: "Complete authenticator verification before accessing your workspace." }, status: :forbidden
  end

  def require_recent_mfa!
    return if PrivilegedMfa.verified?(current_user, authentication_session, recent: true)
    render json: { error: "mfa_step_up_required", message: "Verify MFA again; sensitive actions require verification within 10 minutes." }, status: :forbidden
  end
end
