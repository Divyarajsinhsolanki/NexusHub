require "digest"

class VaultKeyProvider
  def encryption_key
    key = Integrations::SecretBox.keyring[Integrations::SecretBox.active_id]
    raise Integrations::SecretBox::Unavailable, "The active vault encryption key is unavailable." unless key
    vault_key(key)
  end

  def decryption_keys(_message)
    current = Integrations::SecretBox.keyring.values.map { |key| vault_key(key) }
    # Read-only compatibility for existing encrypted records. New writes never
    # derive from session signing keys or the Operations key.
    legacy = [Rails.application.secret_key_base]
    legacy << ENV["PROJECT_OPERATIONS_ENCRYPTION_KEY"] if Operations::Encryption.available?
    current + legacy.map { |secret| ActiveRecord::Encryption::Key.new(Digest::SHA256.digest("vault-content-v1:#{secret}")) }
  end

  private

  def vault_key(key)
    ActiveRecord::Encryption::Key.new(Digest::SHA256.digest("vault-content-v2:#{key}"))
  end
end
