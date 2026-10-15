class PrivacyRequest < ApplicationRecord
  NOTICE_VERSION = '2026-10-15'.freeze
  TYPES = %w[access correction erasure portability restriction objection consent_withdrawal complaint other].freeze
  STATUSES = %w[pending_verification received in_progress needs_information completed declined].freeze
  CLOSED = %w[completed declined].freeze
  has_many :privacy_request_events, dependent: :delete_all
  self.filter_attributes += [:payload_ciphertext]
  before_validation(on: :create) do
    self.reference ||= SecureRandom.uuid
    self.target_response_at ||= 30.days.from_now
  end
  validates :request_type, inclusion: { in: TYPES }
  validates :status, inclusion: { in: STATUSES }
  validates :reference, :target_response_at, presence: true

  def payload
    return {} if payload_ciphertext.blank?
    Integrations::SecretBox.decrypt(payload_ciphertext, context: "privacy-request:v1:#{reference}")
  end

  def payload=(value)
    self.reference ||= SecureRandom.uuid
    self.payload_ciphertext = Integrations::SecretBox.encrypt(value, context: "privacy-request:v1:#{reference}")
  end

  def public_payload
    { reference:, request_type:, status:, created_at:, email_verified_at:, target_response_at:,
      response: payload['response'], redacted_at: }
  end

  def serializable_hash(options = nil)
    super((options || {}).merge(except: Array(options&.dig(:except)) + ['payload_ciphertext']))
  end
end
