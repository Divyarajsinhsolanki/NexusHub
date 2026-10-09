require 'digest'

class VaultKeyProvider
  def encryption_key
    keys.last
  end

  def decryption_keys(_message)
    keys
  end

  private

  def keys
    # Separate Vault keys from Operations keys, even when sharing the stable secret.
    secrets = [Rails.application.secret_key_base]
    secrets << ENV['PROJECT_OPERATIONS_ENCRYPTION_KEY'] if Operations::Encryption.available?
    secrets.map { |secret| ActiveRecord::Encryption::Key.new(Digest::SHA256.digest("vault-content-v1:#{secret}")) }
  end
end
