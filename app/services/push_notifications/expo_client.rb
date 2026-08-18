require "net/http"

module PushNotifications
  class ExpoClient
    PUSH_URL = URI("https://exp.host/--/api/v2/push/send")
    RECEIPTS_URL = URI("https://exp.host/--/api/v2/push/getReceipts")
    MAX_MESSAGES = 100
    MAX_RECEIPTS = 1_000
    MAX_MESSAGE_BYTES = 4_096

    class Error < StandardError
      attr_reader :status

      def initialize(message, status: nil)
        @status = status
        super(message)
      end
    end
    class TransientError < Error; end
    class PermanentError < Error; end

    def send_messages(messages)
      raise ArgumentError, "Expo accepts at most #{MAX_MESSAGES} messages" if messages.size > MAX_MESSAGES
      if messages.any? { |message| JSON.generate(message).bytesize > MAX_MESSAGE_BYTES }
        raise PermanentError, "Expo push payload exceeds #{MAX_MESSAGE_BYTES} bytes"
      end

      data = request(PUSH_URL, messages)["data"]
      raise PermanentError, "Expo push response did not include tickets" unless data

      data
    end

    def fetch_receipts(ticket_ids)
      raise ArgumentError, "Expo accepts at most #{MAX_RECEIPTS} receipt IDs" if ticket_ids.size > MAX_RECEIPTS

      request(RECEIPTS_URL, { ids: ticket_ids })["data"] || {}
    end

    private

    def request(uri, payload)
      request = Net::HTTP::Post.new(uri)
      request["Accept"] = "application/json"
      request["Content-Type"] = "application/json"
      access_token = ENV["EXPO_ACCESS_TOKEN"].to_s
      request["Authorization"] = "Bearer #{access_token}" if access_token.present?
      request.body = JSON.generate(payload)

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 10) do |http|
        http.request(request)
      end
      parsed = JSON.parse(response.body.presence || "{}")
      return parsed if response.is_a?(Net::HTTPSuccess)

      error_class = response.code.to_i == 429 || response.code.to_i >= 500 ? TransientError : PermanentError
      raise error_class.new("Expo push request failed", status: response.code.to_i)
    rescue JSON::ParserError => error
      raise TransientError.new("Expo returned an unreadable response: #{error.class}")
    rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, Errno::ECONNRESET, Errno::ECONNREFUSED => error
      raise TransientError.new("Expo push request failed: #{error.class}")
    end
  end
end
