class JwtService
  SECRET_KEY = Rails.application.credentials.secret_key_base

  def self.encode(payload, exp: 15.minutes.from_now.to_i)
    payload[:exp] = exp.to_i
    JWT.encode(payload, SECRET_KEY)
  end

  def self.decode(token)
    return nil if token.blank?

    decoded = JWT.decode(token, SECRET_KEY, true, { algorithm: "HS256" })[0]
    decoded.with_indifferent_access
  rescue JWT::ExpiredSignature => e
    Rails.logger.warn("JwtService.decode expired token: #{e.message}")
    Rails.error.report(e, handled: true, context: { service: 'JwtService', operation: 'decode', token_state: 'expired' })
    { error: :expired_token }
  rescue JWT::DecodeError => e
    Rails.logger.warn("JwtService.decode invalid token: #{e.message}")
    Rails.error.report(e, handled: true, context: { service: 'JwtService', operation: 'decode', token_state: 'invalid' })
    { error: :invalid_token }
  end
end
