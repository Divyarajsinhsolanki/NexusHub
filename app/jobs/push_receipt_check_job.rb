class PushReceiptCheckJob < ApplicationJob
  queue_as :default
  retry_on PushNotifications::ExpoClient::TransientError, wait: :polynomially_longer, attempts: 5

  def perform(delivery_ids)
    deliveries = PushDelivery.awaiting_receipt.where(id: Array(delivery_ids)).includes(:mobile_device, :notification).to_a
    return if deliveries.empty?

    missing = []
    deliveries.each_slice(PushNotifications::ExpoClient::MAX_RECEIPTS) do |slice|
      receipts = PushNotifications::ExpoClient.new.fetch_receipts(slice.map(&:expo_ticket_id))
      slice.each do |delivery|
        receipt = receipts[delivery.expo_ticket_id]
        unless receipt
          missing << delivery
          next
        end

        handle_receipt(delivery, receipt)
      end
    end

    retryable = missing.select { |delivery| delivery.sent_at && delivery.sent_at > 24.hours.ago }
    self.class.set(wait: 15.minutes).perform_later(retryable.map(&:id)) if retryable.any?
    (missing - retryable).each { |delivery| delivery.record_failure!(code: "ReceiptUnavailable", attempted: false) }
  end

  private

  def handle_receipt(delivery, receipt)
    if receipt["status"] == "ok"
      delivery.update!(status: "accepted", receipt_checked_at: Time.current, last_error_code: nil, last_error_message: nil)
      return
    end

    code = receipt.dig("details", "error").presence || "ExpoReceiptError"
    delivery.update!(
      status: "failed",
      receipt_checked_at: Time.current,
      last_error_code: code.to_s.first(100),
      last_error_message: nil
    )
    delivery.mobile_device.disable! if code == "DeviceNotRegistered"

    if code == "MessageRateExceeded" && delivery.notification
      PushNotificationDispatchJob.set(wait: 5.minutes).perform_later(delivery.notification_id)
    elsif code != "DeviceNotRegistered"
      PushNotifications.report(StandardError.new("Expo receipt rejected"), delivery: delivery)
    end
  end
end
