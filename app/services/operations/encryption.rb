module Operations
  module Encryption
    module_function

    def available?
      ENV["PROJECT_OPERATIONS_ENCRYPTION_KEY"].to_s.match?(/\A[0-9a-fA-F]{64}\z/)
    end

    def key
      raise EncryptionUnavailable, "Configuration encryption is unavailable. Ask an administrator to configure the encryption key." unless available?

      [ENV.fetch("PROJECT_OPERATIONS_ENCRYPTION_KEY")].pack("H*")
    end

    def read(record, attribute)
      key
      record.public_send(attribute)
    rescue EncryptionUnavailable
      raise
    rescue StandardError
      raise EncryptionUnavailable, "A stored value could not be read. Check the configured encryption key; the stored value has been preserved."
    end
  end
end
