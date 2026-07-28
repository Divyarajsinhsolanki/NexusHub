class Api::V1::RealtimeController < Api::V1::BaseController
  TOKEN_TTL = 60.seconds

  def token
    expires_at = TOKEN_TTL.from_now
    payload = {
      user_id: current_user.id,
      mobile_session_id: current_mobile_session&.id,
      type: "cable_access"
    }
    access_token = JwtService.encode(payload, exp: expires_at)
    configured_url = ENV["ACTION_CABLE_URL"].presence || "#{request.base_url.sub(/\Ahttp/, 'ws')}/cable"
    separator = configured_url.include?("?") ? "&" : "?"

    render_data(
      {
        token: access_token,
        expires_at: expires_at.to_i,
        url: "#{configured_url}#{separator}token=#{CGI.escape(access_token)}"
      }
    )
  end
end
