require "net/http"
require "jwt"

module Chat
  # RoomService is authoritative even when mobile JavaScript is suspended.
  class LivekitRoomPresence
    class Unavailable < StandardError; end

    def self.identities(call_session)
      raise Unavailable, "Media server is not configured" unless LivekitTokenGenerator.configured?
      uri = URI.parse(LivekitTokenGenerator.livekit_url.sub(/\Awss:/, "https:").sub(/\Aws:/, "http:"))
      uri.path = "#{uri.path.delete_suffix('/')}/twirp/livekit.RoomService/ListParticipants"
      uri.query = nil
      request = Net::HTTP::Post.new(uri)
      request['Content-Type'] = 'application/json'
      request['Authorization'] = "Bearer #{JWT.encode({
        iss: LivekitTokenGenerator.livekit_api_key, nbf: Time.current.to_i - 5,
        exp: 1.minute.from_now.to_i,
        video: { roomAdmin: true, room: call_session.livekit_room_name }
      }, LivekitTokenGenerator.livekit_api_secret, 'HS256')}"
      request.body = { room: call_session.livekit_room_name }.to_json
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == 'https', open_timeout: 3, read_timeout: 5) { |http| http.request(request) }
      payload = JSON.parse(response.body)
      # Twirp's explicit not_found means the room no longer exists. Other
      # failures must not be interpreted as an empty room.
      return [] if response.code == '404' && payload['code'] == 'not_found'
      raise Unavailable, "Media presence lookup failed" unless response.is_a?(Net::HTTPSuccess) && payload.is_a?(Hash) && (!payload.key?('participants') || payload['participants'].is_a?(Array))
      Array(payload['participants']).filter_map { |participant| participant['identity'] if participant.is_a?(Hash) && ['ACTIVE', 2].include?(participant['state']) }
    rescue Unavailable
      raise
    rescue StandardError
      raise Unavailable, "Media presence lookup failed"
    end
  end
end
