class PrivacyRequestMaintenanceJob < ApplicationJob
  queue_as :default

  def perform
    PrivacyRequest.where(status: 'pending_verification').where('created_at < ?', 7.days.ago).limit(500).find_each do |record|
      record.with_lock { record.destroy! if record.email_verified_at.nil? }
    end
    PrivacyRequest.where(status: PrivacyRequest::CLOSED, redacted_at: nil).where('closed_at < ?', 90.days.ago).limit(500).find_each do |record|
      record.with_lock do
        record.update!(payload_ciphertext: nil, redacted_at: Time.current)
        record.privacy_request_events.create!(action: 'payload_redacted', status: record.status)
      end
    end
    PrivacyRequest.where(status: PrivacyRequest::CLOSED).where('closed_at < ?', 365.days.ago).limit(500).find_each(&:destroy!)
  end
end
