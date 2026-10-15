require "uri"
require "openssl"

module Integrations
  class CredentialValidation
    def self.call(provider, input)
      raise ArgumentError, "Credential must be 32KB or smaller." if input.to_s.bytesize > 32.kilobytes
      case provider
      when "google_sheets"
        data = JSON.parse(input.to_s)
        unless data.is_a?(Hash) && data["type"] == "service_account" && data["client_email"].to_s.match?(/\A[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com\z/)
          raise ArgumentError, "Enter a Google service-account JSON credential."
        end
        pem = data.fetch("private_key")
        unless pem.is_a?(String) && pem.match?(/\A-----BEGIN (?:RSA )?PRIVATE KEY-----/) && !pem.include?("ENCRYPTED")
          raise ArgumentError, "Service account must contain an unencrypted RSA private key."
        end
        key = OpenSSL::PKey.read(pem)
        raise ArgumentError, "Service account RSA keys must be at least 2048 bits." unless key.is_a?(OpenSSL::PKey::RSA) && key.private? && key.n.num_bits >= 2048
        # Never let supplied OAuth endpoints redirect private assertions to an attacker.
        safe = data.slice("type", "project_id", "private_key_id", "private_key", "client_email", "client_id")
        safe["token_uri"] = "https://oauth2.googleapis.com/token"
        [safe, { "service_account_email" => data["client_email"] }]
      when "slack"
        uri = URI.parse(input.to_s.strip)
        unless uri.is_a?(URI::HTTPS) && %w[hooks.slack.com hooks.slack-gov.com].include?(uri.hostname) &&
            uri.port == 443 && !uri.userinfo && !uri.query && !uri.fragment && uri.path.match?(%r{\A/services/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+\z})
          raise ArgumentError, "Enter an HTTPS Slack incoming webhook URL."
        end
        [uri.to_s, {}]
      else
        raise ArgumentError, "Unsupported integration provider."
      end
    rescue JSON::ParserError, KeyError, OpenSSL::PKey::PKeyError, URI::InvalidURIError
      raise ArgumentError, "Credential format is invalid."
    end
  end
end
