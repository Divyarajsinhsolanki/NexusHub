class MobileAccessToken
  TTL = 15.minutes

  def self.issue(session)
    expires_at = TTL.from_now
    effective_user = session.effective_user
    payload = {
      user_id: effective_user.id,
      mobile_session_id: session.id,
      type: "mobile_access"
    }
    payload[:impersonator_id] = session.user_id if session.impersonating?

    {
      token: JwtService.encode(payload, exp: expires_at),
      expires_at: expires_at
    }
  end
end
