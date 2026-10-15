module ProtectedKekaCredentials
  extend ActiveSupport::Concern

  def keka_secret_context
    "personal-keka:v1:#{workspace_id}:#{id}:#{keka_base_url.to_s.strip.chomp('/')}"
  end

  def keka_api_key=(value)
    raise ArgumentError, "Save the user before configuring Keka." unless persisted?
    ciphertext = value.present? ? Integrations::SecretBox.encrypt(value.to_s, context: keka_secret_context) : nil
    self.keka_secret_ciphertext = ciphertext
    self.encrypted_keka_api_key = nil
    self.encrypted_keka_api_key_iv = nil
  end

  def keka_api_key
    return nil if keka_secret_ciphertext.blank?
    Integrations::SecretBox.decrypt(keka_secret_ciphertext, context: keka_secret_context)
  end

  def migrate_legacy_keka_secret!
    return false if keka_secret_ciphertext.present? || encrypted_keka_api_key.blank?
    value = legacy_keka_api_key
    raise Integrations::SecretBox::Unavailable, "Legacy credential could not be read; it has been preserved." if value.blank?
    self.keka_api_key = value
    self.keka_profile_data = Integrations::Redactor.call(keka_profile_data || {}, known_secrets: [value])
    save!
    true
  end
end
