require "jwt"
require "uri"

module Chat
  class LivekitTokenGenerator
    class ConfigurationError < StandardError; end

    TOKEN_TTL = 10.minutes

    class << self
      def configured?
        configuration_error.nil?
      end

      def configuration_error
        missing = {
          "LIVEKIT_URL" => livekit_url,
          "LIVEKIT_API_KEY" => livekit_api_key,
          "LIVEKIT_API_SECRET" => livekit_api_secret
        }.filter_map { |name, value| name if value.blank? }
        return "Missing #{missing.join(', ')}" if missing.any?

        uri = URI.parse(livekit_url)
        return "LIVEKIT_URL must be a ws:// or wss:// URL" unless uri.scheme.in?(%w[ws wss]) && uri.host.present?

        if Rails.env.production? && (uri.scheme != "wss" || uri.host.in?(%w[localhost 127.0.0.1 ::1]))
          return "LIVEKIT_URL must be a publicly reachable wss:// URL in production"
        end

        nil
      rescue URI::InvalidURIError
        "LIVEKIT_URL is invalid"
      end

      def livekit_url
        ENV["LIVEKIT_URL"].presence || Rails.application.credentials.dig(:livekit, :url)
      end

      def livekit_api_key
        ENV["LIVEKIT_API_KEY"].presence || Rails.application.credentials.dig(:livekit, :api_key)
      end

      def livekit_api_secret
        ENV["LIVEKIT_API_SECRET"].presence || Rails.application.credentials.dig(:livekit, :api_secret)
      end
    end

    def initialize(call_session:, user:)
      @call_session = call_session
      @user = user
    end

    def call
      ensure_configured!

      {
        server_url: livekit_url,
        participant_token: JWT.encode(payload, livekit_api_secret, "HS256")
      }
    end

    private

    attr_reader :call_session, :user

    def payload
      now = Time.current.to_i

      {
        iss: livekit_api_key,
        sub: participant_identity,
        name: user.full_name,
        metadata: participant_metadata.to_json,
        nbf: now - 5,
        exp: (Time.current + TOKEN_TTL).to_i,
        video: {
          room: call_session.livekit_room_name,
          roomJoin: true,
          canPublish: true,
          canPublishData: true,
          canSubscribe: true
        }
      }
    end

    def participant_identity
      "workspace-#{call_session.workspace_id}:user-#{user.id}"
    end

    def participant_metadata
      {
        workspace_id: call_session.workspace_id,
        conversation_id: call_session.conversation_id,
        call_session_id: call_session.id,
        user_id: user.id
      }
    end

    def ensure_configured!
      error = self.class.configuration_error
      return unless error

      raise ConfigurationError, error
    end

    def livekit_url
      self.class.livekit_url
    end

    def livekit_api_key
      self.class.livekit_api_key
    end

    def livekit_api_secret
      self.class.livekit_api_secret
    end
  end
end
