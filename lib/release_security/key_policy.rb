require 'digest'
require_relative 'gate'
module ReleaseSecurity
  module KeyPolicy
    # Public fingerprint of the historical commented Devise example. Retain it
    # so this published value cannot later become an active signing credential.
    REVOKED_SHA256 = %w[6d2e65da1e9da543f8525c2265564d5499697f52f8ea2197d30887eab2a98872].freeze
    def self.verify!(values, revoked: REVOKED_SHA256)
      if values.compact.any? { |value| revoked.include?(Digest::SHA256.hexdigest(value.to_s)) }
        raise Rejected, 'A published signing key is configured. Provision a new key and follow the documented rotation/recovery procedure.'
      end
      true
    end
  end
end
