require "jwt"

module Chat
  class LivekitTokenGenerator
    class ConfigurationError < StandardError; end

    TOKEN_TTL = 10.minutes

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
      return if livekit_url.present? && livekit_api_key.present? && livekit_api_secret.present?

      raise ConfigurationError, "LiveKit is not configured"
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
end
