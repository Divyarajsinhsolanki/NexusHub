module PushNotifications
  class DeliveryDispatcher
    TRANSIENT_TICKET_ERRORS = %w[MessageRateExceeded].freeze

    def initialize(client: ExpoClient.new)
      @client = client
    end

    def call(entries)
      entries.each_slice(ExpoClient::MAX_MESSAGES) { |slice| deliver_slice(slice) }
    end

    private

    attr_reader :client

    def deliver_slice(entries)
      pending = entries.reject { |delivery, _payload| %w[ticketed accepted].include?(delivery.status) }
      return if pending.empty?

      results = client.send_messages(pending.map(&:last))
      results = [results] unless results.is_a?(Array)
      ticketed_ids = []
      transient = false

      pending.zip(results).each do |(delivery, _payload), result|
        if result.is_a?(Hash) && result["status"] == "ok" && result["id"].present?
          delivery.record_ticket!(result["id"])
          ticketed_ids << delivery.id
          next
        end

        code = result.is_a?(Hash) ? result.dig("details", "error").presence || "ExpoTicketError" : "MissingExpoTicket"
        delivery.record_failure!(code: code, message: result.is_a?(Hash) ? result["message"] : nil)
        delivery.mobile_device.disable! if code == "DeviceNotRegistered"
        transient ||= TRANSIENT_TICKET_ERRORS.include?(code)
      end

      PushReceiptCheckJob.set(wait: 15.minutes).perform_later(ticketed_ids) if ticketed_ids.any?
      raise ExpoClient::TransientError, "Expo asked Nexus Hub to slow down" if transient
    rescue ExpoClient::TransientError => error
      pending&.each do |delivery, _payload|
        next if %w[ticketed accepted].include?(delivery.status)

        delivery.record_failure!(code: "TransientDeliveryError")
      end
      raise error
    rescue ExpoClient::PermanentError => error
      pending&.each do |delivery, _payload|
        next if %w[ticketed accepted].include?(delivery.status)

        delivery.record_failure!(code: "PermanentDeliveryError")
        PushNotifications.report(error, delivery: delivery)
      end
    end
  end
end
