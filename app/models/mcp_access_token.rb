require "digest"
require "securerandom"

class McpAccessToken < ApplicationRecord
  TOKEN_PREFIX = "rv_mcp_".freeze
  DEFAULT_SCOPES = %w[app:read app:write repo:read].freeze

  belongs_to :workspace
  belongs_to :user

  validates :name, :token_digest, presence: true
  validates :token_digest, uniqueness: true
  validate :user_belongs_to_workspace

  before_validation :assign_workspace

  scope :active, -> {
    where(revoked_at: nil)
      .where("expires_at IS NULL OR expires_at > ?", Time.current)
  }

  def self.issue!(user:, name:, scopes: DEFAULT_SCOPES, expires_at: 180.days.from_now)
    raw_token = "#{TOKEN_PREFIX}#{SecureRandom.urlsafe_base64(48)}"
    record = create!(
      user: user,
      workspace: user.workspace,
      name: name,
      token_digest: digest(raw_token),
      scopes: Array(scopes).map(&:to_s).presence || DEFAULT_SCOPES,
      expires_at: expires_at
    )

    [record, raw_token]
  end

  def self.authenticate(raw_token)
    return if raw_token.blank?

    token = active.includes(:user, :workspace).find_by(token_digest: digest(raw_token.to_s))
    return unless token && token.user.workspace_access?(token.workspace)

    return if (token.scopes & %w[system:admin db:read repo:write]).any?
    return if PrivilegedMfa.required?(token.user) || token.user.mfa_enabled_at

    token.touch(:last_used_at)
    token
  end

  def self.digest(raw_token)
    Digest::SHA256.hexdigest(raw_token.to_s)
  end

  def allows?(scope)
    scopes.include?(scope.to_s)
  end

  def revoke!
    update!(revoked_at: Time.current)
  end

  private

  def assign_workspace
    self.workspace ||= user&.workspace
  end

  def user_belongs_to_workspace
    return if user.blank? || workspace.blank? || user.workspace_id == workspace_id

    errors.add(:user_id, "must belong to the token workspace")
  end
end
