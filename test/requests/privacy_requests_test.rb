require 'test_helper'
require 'minitest/mock'

class PrivacyRequestsTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @input = { email: 'requester@example.test', name: 'Requester', request_type: 'access', details: 'Please review my records.', country: 'India' }
    @previous_cache = Rack::Attack.cache.store
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
  end

  teardown { Rack::Attack.cache.store = @previous_cache }

  test 'mail queue failure preserves the request and gives a usable follow-up reference' do
    delivery = Object.new
    def delivery.deliver_later = raise(ActiveJob::EnqueueError, 'Unavailable')
    PrivacyRequestMailer.stub(:verification, delivery) do
      assert_difference 'PrivacyRequest.count', 1 do
        post '/api/privacy_requests', params: { privacy_request: @input }, as: :json
      end
      assert_response :service_unavailable
      assert_includes response.parsed_body['error'], PrivacyRequest.order(:id).last.reference
      refute_includes response.body, @input[:details]
    end
  end

  test 'public cookie intake rejects missing CSRF tokens and cross-site origins' do
    previous = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    post '/api/privacy_requests', params: { privacy_request: @input }, as: :json
    assert_response :unprocessable_entity
    post '/api/privacy_requests', params: { privacy_request: @input }, headers: { 'Origin' => 'https://attacker.test' }, as: :json
    assert_response :forbidden
  ensure
    ActionController::Base.allow_forgery_protection = previous
  end

  test 'public intake records encrypted content without account discovery and queues verification' do
    assert_enqueued_with(job: ActionMailer::MailDeliveryJob) do
      post '/api/privacy_requests', params: { privacy_request: @input, user_id: 123, workspace_id: 456 }, as: :json
    end
    assert_response :accepted
    record = PrivacyRequest.find_by!(reference: response.parsed_body['reference'])
    assert_equal 'pending_verification', record.status
    assert_equal @input[:email], record.payload['email']
    refute_includes record.payload_ciphertext, @input[:email]
    refute_includes response.body, @input[:email]
    refute_includes record.to_json, record.payload_ciphertext
    other = PrivacyRequest.new(reference: SecureRandom.uuid, payload_ciphertext: record.payload_ciphertext)
    assert_raises(Integrations::SecretBox::Unavailable) { other.payload }
  end

  test 'email verification requires explicit POST and tracking requires the correct signed purpose' do
    record = create_request
    verification = record.signed_id(purpose: 'privacy-verification', expires_in: 24.hours)
    tracking = record.signed_id(purpose: 'privacy-tracking', expires_in: 30.days)
    post '/api/privacy_requests/status', params: { token: tracking }, as: :json
    assert_response :unprocessable_entity
    post '/api/privacy_requests/verify', params: { token: verification }, as: :json
    assert_response :success
    assert record.reload.email_verified_at
    assert_equal 'received', record.status
    assert_equal 1, record.privacy_request_events.count
    token = response.parsed_body['tracking_token']
    post '/api/privacy_requests/verify', params: { token: verification }, as: :json
    assert_response :unprocessable_entity
    post '/api/privacy_requests/status', params: { token: verification }, as: :json
    assert_response :unprocessable_entity
    post '/api/privacy_requests/status', params: { token: token }, as: :json
    assert_response :success
    refute_includes response.body, @input[:email]
    refute_includes response.body, @input[:details]
    assert_equal record.reference, response.parsed_body.dig('request', 'reference')
  end

  test 'expired or tampered links fail and native public intake does not require membership' do
    record = create_request
    token = record.signed_id(purpose: 'privacy-verification', expires_in: 1.minute)
    travel 2.minutes do
      post '/api/privacy_requests/verify', params: { token: token }, as: :json
      assert_response :unprocessable_entity
    end
    post '/api/privacy_requests/verify', params: { token: token + 'bad' }, as: :json
    assert_response :unprocessable_entity
    post '/api/v1/privacy_requests', params: { privacy_request: @input }, as: :json
    assert_response :accepted
  end

  test 'validation rate limits and encryption failures do not expose submitted details' do
    post '/api/privacy_requests', params: { privacy_request: @input.merge(request_type: 'administrator', details: 'x' * 4001) }, as: :json
    assert_response :unprocessable_entity
    3.times do
      post '/api/privacy_requests', params: { privacy_request: @input }, as: :json
      assert_response :accepted
    end
    post '/api/privacy_requests', params: { privacy_request: @input }, as: :json
    assert_response :too_many_requests
    Integrations::SecretBox.stub(:encrypt, ->(*) { raise Integrations::SecretBox::Unavailable }) do
      post '/api/privacy_requests', params: { privacy_request: @input.merge(email: 'another@example.test') }, as: :json
      assert_response :service_unavailable
      refute_includes response.body, @input[:details]
    end
  end

  test 'verification mail uses trusted configured origin and fragment links without request content' do
    record = create_request
    mail = PrivacyRequestMailer.verification(record.id)
    assert_equal [@input[:email]], mail.to
    [mail.text_part, mail.html_part].each do |part|
      assert_includes part.body.decoded, '/privacy-requests#verify='
      assert_includes part.body.decoded, '/privacy-requests#track='
      refute_includes part.body.decoded, @input[:details]
    end
  end

  private

  def create_request
    record = PrivacyRequest.new(request_type: 'access')
    record.payload = @input.stringify_keys.except('request_type')
    record.save!
    record
  end
end
