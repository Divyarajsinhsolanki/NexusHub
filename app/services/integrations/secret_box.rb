require "json"
require "digest"

module Integrations
  class SecretBox
    class Unavailable < StandardError; end
    KEY_ID = /\A[a-zA-Z0-9_-]{1,40}\z/

    def self.keyring
      raw = ENV["INTEGRATION_ENCRYPTION_KEYS"].presence
      unless raw
        raise Unavailable, "Integration encryption is not configured." if Rails.env.production?
        return { "development" => Digest::SHA256.hexdigest("integration-development:#{Rails.application.secret_key_base}") }
      end
      keys = JSON.parse(raw)
      unless keys.is_a?(Hash) && keys.size.between?(1, 8) && keys.all? { |id, key| id.match?(KEY_ID) && key.is_a?(String) && key.match?(/\A[0-9a-fA-F]{64}\z/) }
        raise Unavailable, "Integration encryption configuration is invalid."
      end
      keys
    rescue JSON::ParserError
      raise Unavailable, "Integration encryption configuration is invalid."
    end

    def self.active_id
      ENV["INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID"].presence || (Rails.env.production? ? "v1" : (ENV["INTEGRATION_ENCRYPTION_KEYS"].present? ? "v1" : "development"))
    end

    def self.encrypt(value, context:)
      id = active_id
      key = keyring[id]
      raise Unavailable, "The active integration encryption key is missing." unless key
      encrypted = encryptor(key).encrypt_and_sign(value, purpose: context)
      JSON.generate(v: 1, kid: id, ciphertext: encrypted)
    end

    def self.decrypt(value, context:)
      envelope = JSON.parse(value)
      key = keyring[envelope.fetch("kid")]
      raise Unavailable, "The stored integration key is unavailable; the credential has been preserved." unless key && envelope["v"] == 1
      result = encryptor(key).decrypt_and_verify(envelope.fetch("ciphertext"), purpose: context)
      raise Unavailable, "The stored integration credential could not be verified." if result.nil?
      result
    rescue JSON::ParserError, KeyError, TypeError, ActiveSupport::MessageEncryptor::InvalidMessage
      raise Unavailable, "The stored integration credential could not be verified; it has been preserved."
    end

    def self.encryptor(hex)
      ActiveSupport::MessageEncryptor.new([hex].pack("H*"), cipher: "aes-256-gcm", serializer: JSON)
    end
  end
end
