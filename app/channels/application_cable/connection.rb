module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user, :current_workspace

    def connect
      self.current_user = find_verified_user
      self.current_workspace = current_user.workspace
    end

    private

    def find_verified_user
      mobile_token_user || jwt_cookie_user || warden_user || reject_unauthorized_connection
    end

    def mobile_token_user
      payload = JwtService.decode(request.params[:token].to_s)
      return if payload.blank? || payload[:error].present? || payload[:type] != "cable_access"

      session = MobileSession.active.includes(:user, :impersonated_user).find_by(id: payload[:mobile_session_id])
      return if payload[:mobile_session_id].present? && (session.nil? || session.user.locked?)
      user = session&.effective_user || User.find_by(id: payload[:user_id])
      return if user.blank? || user.locked? || user.id != payload[:user_id].to_i

      user
    end

    def jwt_cookie_user
      WebSession.authenticate(cookies.signed[:access_token], type: "web_access")&.user
    rescue StandardError
      nil
    end

    def warden_user
      env["warden"]&.user
    end
  end
end
