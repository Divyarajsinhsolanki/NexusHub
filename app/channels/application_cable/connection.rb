module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user, :current_workspace, :session_key
    before_command :verify_session!

    def connect
      self.current_user = find_verified_user
      reject_unauthorized_connection unless current_user.workspace_access?
      self.current_workspace = current_user.workspace
      reject_unauthorized_connection unless session_valid?
    end

    def session_valid?
      session = @authentication_session.reload
      (!(PrivilegedMfa.required?(session.user) || session.user.mfa_enabled_at) || PrivilegedMfa.verified?(session.user, session)) &&
        session.revoked_at.nil? && session.expires_at > Time.current &&
        session.user.reload.workspace_access? && current_user.reload.workspace_access?(current_workspace) &&
        (session.is_a?(WebSession) ? session.password_fingerprint == WebSession.fingerprint(session.user) : session.effective_user.id == current_user.id)
    rescue ActiveRecord::RecordNotFound
      false
    end

    def verify_session!
      return if session_valid?

      close(reason: "session_revoked", reconnect: false)
      throw :abort
    end

    private

    def find_verified_user
      # Explicit credentials must never fall back to another authentication method.
      if request.params[:token].present?
        mobile_token_user || reject_unauthorized_connection
      else
        jwt_cookie_user || reject_unauthorized_connection
      end
    end

    def mobile_token_user
      payload = JwtService.decode(request.params[:token].to_s)
      return if payload.blank? || payload[:error].present? || payload[:type] != "cable_access" || payload[:mobile_session_id].blank?

      session = MobileSession.active.includes(:user, :impersonated_user).find_by(id: payload[:mobile_session_id])
      return unless session && !session.user.locked?
      user = session.effective_user
      return if user.locked? || user.id != payload[:user_id].to_i

      @authentication_session = session
      self.session_key = "mobile:#{session.id}"
      user
    end

    def jwt_cookie_user
      session = WebSession.authenticate(cookies.signed[:access_token], type: "web_access")
      return unless session

      @authentication_session = session
      self.session_key = "web:#{session.id}"
      session.user
    end
  end
end
