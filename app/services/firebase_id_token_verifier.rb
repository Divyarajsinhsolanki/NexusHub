require "net/http"

class FirebaseIdTokenVerifier
  CERTS_URL = URI("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com")

  def self.call(token)
    new(token).call
  end

  def initialize(token)
    @token = token.to_s
  end

  def call
    return if @token.blank? || project_id.blank?

    header = JWT.decode(@token, nil, false).last
    certificate = certificates[header["kid"]]
    return unless certificate

    JWT.decode(
      @token,
      OpenSSL::X509::Certificate.new(certificate).public_key,
      true,
      algorithm: "RS256",
      iss: "https://securetoken.google.com/#{project_id}",
      verify_iss: true,
      aud: project_id,
      verify_aud: true
    ).first.with_indifferent_access
  rescue JWT::DecodeError, JSON::ParserError, OpenSSL::OpenSSLError, StandardError => error
    Rails.logger.warn("Firebase token verification failed: #{error.class}: #{error.message}")
    nil
  end

  private

  def project_id
    @project_id ||= ENV["FIREBASE_PROJECT_ID"].presence || ENV["VITE_FIREBASE_PROJECT_ID"].presence
  end

  def certificates
    Rails.cache.fetch("firebase_id_token_certificates", expires_in: 1.hour) do
      response = Net::HTTP.get_response(CERTS_URL)
      raise "Unable to fetch Firebase certificates" unless response.is_a?(Net::HTTPSuccess)

      JSON.parse(response.body)
    end
  end
end
