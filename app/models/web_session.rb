class WebSession < ApplicationRecord
  belongs_to :user

  scope :active, -> { where(revoked_at: nil).where("expires_at > ?", Time.current) }

  def self.issue_for!(user)
    create!(user: user, password_fingerprint: fingerprint(user), expires_at: 7.days.from_now)
  end

  def self.authenticate(token, type:)
    payload = JwtService.decode(token)
    return unless payload.present? && payload[:type] == type && payload[:web_session_id].present?

    session = active.includes(:user).find_by(id: payload[:web_session_id], user_id: payload[:user_id])
    return unless session && !session.user.locked?
    return unless ActiveSupport::SecurityUtils.secure_compare(session.password_fingerprint, fingerprint(session.user))

    session
  end

  def self.fingerprint(user)
    Digest::SHA256.hexdigest(user.encrypted_password)
  end

  def token(type:, expires_at:)
    JwtService.encode({ user_id: user_id, web_session_id: id, type: type }, exp: expires_at)
  end

  def revoke!
    update!(revoked_at: Time.current) unless revoked_at?
  end
end
