class MobileSession < ApplicationRecord
  REFRESH_TOKEN_TTL = 30.days

  belongs_to :user
  belongs_to :workspace
  belongs_to :impersonated_user, class_name: "User", optional: true

  validates :refresh_token_digest, :expires_at, presence: true
  validates :refresh_token_digest, uniqueness: true
  validate :workspace_matches_user

  scope :active, -> { where(revoked_at: nil).where("expires_at > ?", Time.current) }

  def self.issue_for!(user:, device_name: nil)
    raw_token = generate_token
    session = create!(
      user: user,
      workspace: user.workspace,
      device_name: device_name.to_s.first(120).presence,
      refresh_token_digest: digest(raw_token),
      expires_at: REFRESH_TOKEN_TTL.from_now
    )
    [session, raw_token]
  end

  def self.find_by_token(raw_token)
    return if raw_token.blank?

    find_by(refresh_token_digest: digest(raw_token))
  end

  def rotate!(raw_token)
    with_lock do
      return unless usable_token?(raw_token)

      next_token = self.class.generate_token
      update!(
        refresh_token_digest: self.class.digest(next_token),
        last_used_at: Time.current,
        expires_at: REFRESH_TOKEN_TTL.from_now
      )
      next_token
    end
  end

  def revoke!
    update!(revoked_at: Time.current) unless revoked_at?
  end

  def effective_user
    impersonated_user || user
  end

  def impersonating?
    impersonated_user_id.present?
  end

  def usable_token?(raw_token)
    return false if raw_token.blank? || revoked_at? || expires_at <= Time.current

    candidate = self.class.digest(raw_token)
    ActiveSupport::SecurityUtils.secure_compare(refresh_token_digest, candidate)
  end

  def self.digest(raw_token)
    Digest::SHA256.hexdigest(raw_token.to_s)
  end

  def self.generate_token
    SecureRandom.urlsafe_base64(48)
  end

  private

  def workspace_matches_user
    return if user.blank?
    return if workspace_id == user.workspace_id && (impersonated_user.blank? || impersonated_user.workspace_id == workspace_id)

    errors.add(:workspace, "must match the session users' workspace")
  end
end
