require "digest"

class WorkspaceInvitation < ApplicationRecord
  include WorkspaceScoped
  TTL = 7.days
  belongs_to :invited_by, class_name: "User"
  belongs_to :accepted_user, class_name: "User", optional: true
  belongs_to :department, optional: true
  enum :status, { pending: "pending", accepted: "accepted", revoked: "revoked", expired: "expired" }, default: :pending
  before_validation { self.email = email.to_s.strip.downcase }
  validates :email, presence: true, length: { maximum: 254 }, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :token_digest, :expires_at, presence: true
  validate do
    errors.add(:role_names, "is invalid") unless role_names.is_a?(Array) && role_names.present? && (role_names - Role::NAMES).empty?
    errors.add(:project_ids, "is invalid") unless project_ids.is_a?(Array) && project_ids.all? { |id| id.is_a?(Integer) && id.positive? }
  end
  scope :reserved, -> { where(status: "pending").where("expires_at > ?", Time.current) }

  def effective_status
    pending? && expires_at <= Time.current ? "expired" : status
  end

  def token_valid?(raw)
    raw.is_a?(String) && raw.match?(/\A[A-Za-z0-9_-]{43}\z/) &&
      pending? && expires_at.future? && ActiveSupport::SecurityUtils.secure_compare(token_digest, self.class.digest(raw))
  end

  def self.digest(raw)
    Digest::SHA256.hexdigest(raw.to_s)
  end

  def self.encrypt_token(raw)
    encryptor.encrypt_and_sign(raw)
  end

  def self.decrypt_token(encrypted)
    encryptor.decrypt_and_verify(encrypted)
  end

  def self.encryptor
    ActiveSupport::MessageEncryptor.new(Rails.application.key_generator.generate_key("workspace-invitation-delivery", 32))
  end
end
