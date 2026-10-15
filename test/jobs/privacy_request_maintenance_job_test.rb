require 'test_helper'

class PrivacyRequestMaintenanceJobTest < ActiveSupport::TestCase
  test 'daily retention is registered with the durable scheduler' do
    schedule = BackgroundSchedules.definitions(environment: 'production').fetch('production:privacy-request-maintenance')
    assert_equal 'PrivacyRequestMaintenanceJob', schedule['class']
    assert_equal '31 2 * * * UTC', schedule['cron']
    assert schedule['active_job']
  end

  test 'expired unverified requests and closed content are removed but open cases remain' do
    pending = build_request('pending_verification', created_at: 8.days.ago)
    open_case = build_request('in_progress', created_at: 1.year.ago, email_verified_at: 1.year.ago)
    closed = build_request('completed', closed_at: 91.days.ago, email_verified_at: 100.days.ago)
    old = build_request('declined', closed_at: 366.days.ago, email_verified_at: 367.days.ago)
    PrivacyRequestMaintenanceJob.perform_now
    assert_not PrivacyRequest.exists?(pending.id)
    assert_not PrivacyRequest.exists?(old.id)
    assert open_case.reload.payload_ciphertext
    assert_nil closed.reload.payload_ciphertext
    assert closed.redacted_at
    assert_equal 'payload_redacted', closed.privacy_request_events.last.action
  end

  private

  def build_request(status, **attributes)
    record = PrivacyRequest.new(request_type: 'access', status: status, **attributes)
    record.payload = { 'email' => 'retention@example.test', 'details' => 'Private' }
    record.save!
    record
  end
end
