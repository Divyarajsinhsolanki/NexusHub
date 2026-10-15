class WorkspaceIntegration < ApplicationRecord
  include WorkspaceScoped
  PROVIDERS = %w[google_sheets slack].freeze
  self.filter_attributes += [:secret_ciphertext]
  validates :provider, inclusion: { in: PROVIDERS }, uniqueness: { scope: :workspace_id }
  attr_readonly :workspace_id, :provider

  def secret
    raise Integrations::SecretBox::Unavailable, "This workspace connection is not configured." if revoked_at || secret_ciphertext.blank?
    Integrations::SecretBox.decrypt(secret_ciphertext, context: secret_context)
  end

  def replace_secret!(value)
    secret_value, metadata = Integrations::CredentialValidation.call(provider, value)
    update!(secret_ciphertext: Integrations::SecretBox.encrypt(secret_value, context: secret_context), public_settings: metadata, revoked_at: nil)
  end

  def revoke!
    update!(secret_ciphertext: nil, public_settings: {}, revoked_at: Time.current)
  end

  def secret_context
    "workspace-integration:v1:#{workspace_id}:#{provider}"
  end

  def serializable_hash(options = nil)
    super((options || {}).merge(except: Array(options&.dig(:except)) + ["secret_ciphertext"]))
  end

  def public_payload
    { provider:, configured: secret_ciphertext.present? && revoked_at.nil?, settings: public_settings, updated_at:, revoked_at: }
  end
end
