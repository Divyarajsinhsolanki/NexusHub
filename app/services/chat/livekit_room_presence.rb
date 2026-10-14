require "net/http"
require "jwt"

module Chat
  # RoomService is authoritative even when mobile JavaScript is suspended.
  class LivekitRoomPresence
    class Unavailable < StandardError; end

    def self.identities(call_session)
      payload = request(call_session, "ListParticipants", { room: call_session.livekit_room_name }, allow_not_found: true)
      raise Unavailable, "Media presence lookup failed" unless !payload.key?('participants') || payload['participants'].is_a?(Array)
      Array(payload['participants']).filter_map { |participant| participant['identity'] if participant.is_a?(Hash) && ['ACTIVE', 2].include?(participant['state']) }
    rescue Unavailable
      raise
    rescue StandardError
      raise Unavailable, "Media presence lookup failed"
    end
    def self.request(call_session, method, body, allow_not_found: false)
      raise Unavailable, "Media server is not configured" unless LivekitTokenGenerator.configured?
      uri = URI.parse(LivekitTokenGenerator.livekit_url.sub(/\Awss:/, "https:").sub(/\Aws:/, "http:"))
      uri.path = "#{uri.path.delete_suffix('/')}/twirp/livekit.RoomService/#{method}"
      uri.query = nil
      request = Net::HTTP::Post.new(uri)
      request['Content-Type'] = 'application/json'
      request['Authorization'] = "Bearer #{JWT.encode({ iss: LivekitTokenGenerator.livekit_api_key, nbf: Time.current.to_i - 5, exp: 1.minute.from_now.to_i, video: { roomAdmin: true, room: call_session.livekit_room_name }.merge(method == 'DeleteRoom' ? {roomCreate: true} : {}) }, LivekitTokenGenerator.livekit_api_secret, 'HS256')}"
      request.body = body.to_json
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == 'https', open_timeout: 3, read_timeout: 5) { |http| http.request(request) }
      payload = JSON.parse(response.body)
      return {} if allow_not_found && response.code == '404' && payload.is_a?(Hash) && payload['code'] == 'not_found'
      raise Unavailable, "Media server action failed" unless response.is_a?(Net::HTTPSuccess) && payload.is_a?(Hash)
      payload
    rescue Unavailable
      raise
    rescue StandardError
      raise Unavailable, "Media server action failed"
    end
  end
end
