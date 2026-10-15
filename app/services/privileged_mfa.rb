require "rotp"

class PrivilegedMfa
  class Invalid < StandardError; end
  RECENT_WINDOW = 10.minutes
  def self.required?(user)
    user && !user.demo_account? && (user.site_admin? || (user.role_names & %w[owner admin]).any?)
  end

  def self.verified?(user, session, recent: false)
    return false unless session && session.user_id == user.id && session.revoked_at.nil? && session.expires_at.future?
    return false unless user.mfa_enabled_at && session.mfa_verified_at && session.mfa_verified_at >= user.mfa_enabled_at
    !recent || session.mfa_verified_at >= RECENT_WINDOW.ago
  end

  def self.encryptor
    ActiveSupport::MessageEncryptor.new(Rails.application.key_generator.generate_key("privileged-mfa-secrets", 32))
  end

  def self.secret(user)
    encryptor.decrypt_and_verify(user.mfa_secret_ciphertext)
  end

  def self.setup!(user, session, password:)
    result = nil
    with_security_lock(user) do
      raise Invalid, "MFA is already enabled." if user.mfa_enabled_at
      validate_session!(user, session)
      check_lock!(user)
      primary!(user, session, password)
      raw = ROTP::Base32.random
      user.update!(mfa_pending_secret_ciphertext: encryptor.encrypt_and_sign(raw), mfa_pending_expires_at: 10.minutes.from_now)
      result = { secret: raw, provisioning_uri: ROTP::TOTP.new(raw, issuer: "Nexus Hub").provisioning_uri(user.email) }
      audit!(user, "mfa.enrollment_started")
    end
    result
  end

  def self.primary!(user, session, password)
    raise Invalid, "Sign in again or enter your current password." unless user.valid_password?(password.to_s) || (session&.primary_verified_at && session.primary_verified_at >= RECENT_WINDOW.ago)
  end

  def self.confirm!(user, session, code:)
    codes = nil
    with_security_lock(user) do
      validate_session!(user, session)
      check_lock!(user)
      raise Invalid, "Start MFA setup again; the setup key has expired." unless !user.mfa_enabled_at && user.mfa_pending_expires_at&.future?
      raw = encryptor.decrypt_and_verify(user.mfa_pending_secret_ciphertext)
      timestamp = ROTP::TOTP.new(raw).verify(code.to_s, drift_behind: 30, at: Time.current)
      unless timestamp
        record_failure!(user)
        next
      end
      codes = generate_recovery
      user.update!(mfa_secret_ciphertext: encryptor.encrypt_and_sign(raw), mfa_enabled_at: Time.current,
        mfa_pending_secret_ciphertext: nil, mfa_pending_expires_at: nil, mfa_last_otp_at: timestamp,
        mfa_recovery_digests: codes.map { |value| digest(value) }, mfa_failed_attempts: 0, mfa_locked_until: nil)
      revoke_others!(user, session)
      session.update!(mfa_verified_at: Time.current)
      audit!(user, "mfa.enabled")
    end
    raise Invalid, "Invalid authenticator code." unless codes
    codes
  end

  def self.verify!(user, session, code:)
    # Failures must commit the counter, so do not raise until outside the lock transaction.
    success = false
    with_security_lock(user) do
      validate_session!(user, session)
      check_lock!(user)
      raise Invalid, "Set up an authenticator first." unless user.mfa_enabled_at
      value = code.to_s.strip
      timestamp = value.match?(/\A\d{6}\z/) && ROTP::TOTP.new(secret(user)).verify(value, drift_behind: 30, after: user.mfa_last_otp_at, at: Time.current)
      recovery = user.mfa_recovery_digests.find { |candidate| ActiveSupport::SecurityUtils.secure_compare(candidate, digest(value)) }
      if timestamp || recovery
        user.update!(mfa_last_otp_at: timestamp || user.mfa_last_otp_at, mfa_recovery_digests: user.mfa_recovery_digests - [recovery], mfa_failed_attempts: 0, mfa_locked_until: nil)
        revoke_others!(user, session) if recovery
        session.update!(mfa_verified_at: Time.current)
        audit!(user, recovery ? "mfa.recovery_used" : "mfa.verified")
        success = true
      else
        record_failure!(user)
      end
    end
    raise Invalid, "Invalid or already used code. Wait for a new authenticator code or use a recovery code." unless success
    true
  end

  def self.regenerate!(user, session, password:)
    codes = nil
    with_security_lock(user) do
      validate_session!(user, session)
      raise Invalid, "Verify MFA again before replacing recovery codes." unless verified?(user, session, recent: true)
      raise Invalid, "Enter your current password." unless user.valid_password?(password.to_s)
      codes = generate_recovery
      user.update!(mfa_recovery_digests: codes.map { |value| digest(value) })
      revoke_others!(user, session)
      audit!(user, "mfa.recovery_regenerated")
    end
    codes
  end

  def self.disable!(user, session, password:)
    with_security_lock(user) do
      raise Invalid, "Privileged accounts must keep MFA enabled." if required?(user)
      validate_session!(user, session)
      raise Invalid, "Verify MFA again before disabling it." unless verified?(user, session, recent: true)
      raise Invalid, "Enter your current password." unless user.valid_password?(password.to_s)
      user.update!(mfa_secret_ciphertext: nil, mfa_enabled_at: nil, mfa_last_otp_at: nil, mfa_recovery_digests: [])
      revoke_others!(user, session)
      session.update!(mfa_verified_at: nil)
      audit!(user, "mfa.disabled")
    end
  end

  def self.with_security_lock(user)
    # Match membership/offboarding lock order before writing tenant audit rows.
    user.workspace.with_lock { user.with_lock { yield } }
  end

  def self.check_lock!(user)
    raise Invalid, "Too many attempts. Try again in 15 minutes." if user.mfa_locked_until&.future?
  end
  def self.record_failure!(user)
    failures = user.mfa_locked_until && !user.mfa_locked_until.future? ? 1 : user.mfa_failed_attempts + 1
    user.update!(mfa_failed_attempts: failures, mfa_locked_until: failures >= 5 ? 15.minutes.from_now : nil)
    audit!(user, "mfa.verification_failed")
  end
  def self.validate_session!(user, session)
    raise Invalid, "Sign in again." unless session && session.user_id == user.id && session.reload.revoked_at.nil? && session.expires_at.future? && user.workspace_access? && user.confirmed?
  end
  def self.generate_recovery
    Array.new(10) { SecureRandom.hex(10) }
  end
  def self.digest(value)
    Digest::SHA256.hexdigest(value)
  end
  def self.revoke_others!(user, session)
    user.preserved_authentication_session = session
    user.revoke_authentication_sessions
    McpAccessToken.active.where(user: user).find_each(&:revoke!)
  ensure
    user.preserved_authentication_session = nil
  end
  def self.audit!(user, action)
    WorkspaceAccessEvent.create!(workspace: user.workspace, actor: user, subject: user, action: action, details: {})
  end
end
