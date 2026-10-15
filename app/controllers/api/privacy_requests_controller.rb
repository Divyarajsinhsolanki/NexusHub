# Deliberately independent of workspace authentication: former employees and
# people without accounts must be able to contact the operator.
class Api::PrivacyRequestsController < ApplicationController
  protect_from_forgery with: :exception, unless: -> { request.path_info.start_with?('/api/v1/') }
  rescue_from ActionController::InvalidAuthenticityToken do
    render json: { error: 'Invalid authenticity token' }, status: :unprocessable_entity
  end
  rescue_from ActionController::ParameterMissing, ArgumentError do
    render json: { error: 'Enter a valid email, request type, and details (maximum 4,000 characters).' }, status: :unprocessable_entity
  end
  rescue_from ActiveSupport::MessageVerifier::InvalidSignature, ActiveRecord::RecordNotFound do
    render json: { error: 'This link is invalid or expired. Submit a new request if needed.' }, status: :unprocessable_entity
  end
  rescue_from Integrations::SecretBox::Unavailable do
    render json: { error: 'Privacy intake is temporarily unavailable. Please try again or use the contact on the legal page.' }, status: :service_unavailable
  end

  def create
    input = params.require(:privacy_request).permit(:email, :name, :request_type, :details, :country)
    email = input[:email].to_s.strip.downcase
    details = input[:details].to_s.strip
    raise ArgumentError unless email.bytesize <= 254 && email.match?(URI::MailTo::EMAIL_REGEXP) &&
      details.length.between?(1, 4000) && input[:name].to_s.length <= 120 && input[:country].to_s.length <= 100 && PrivacyRequest::TYPES.include?(input[:request_type])
    # Digest counters avoid storing raw addresses in Redis. Never look up whether
    # the submitted email has an account.
    digest = OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, "privacy-intake:#{email}")
    count = Rack::Attack.cache.count("privacy-email:#{digest}", 1.hour)
    raise AbusePrevention::RateLimiter::Unavailable unless count.is_a?(Numeric)
    return render json: { error: 'Please wait before submitting another request.' }, status: :too_many_requests if count > 3
    record = PrivacyRequest.new(request_type: input[:request_type])
    record.payload = { 'email' => email, 'name' => input[:name].to_s.strip, 'details' => details, 'country' => input[:country].to_s.strip, 'notice_version' => PrivacyRequest::NOTICE_VERSION }
    record.save!
    begin
      queued = PrivacyRequestMailer.verification(record.id).deliver_later
    rescue StandardError
      queued = false
    end
    unless queued
      return render json: { error: "Request recorded, but verification email could not be queued. Please retry later or contact the operator with reference #{record.reference}." }, status: :service_unavailable
    end
    render json: { message: 'Your request has been recorded. Check your email to verify your address and track it. If email does not arrive, use the contact on the legal page.', reference: record.reference }, status: :accepted
  rescue AbusePrevention::RateLimiter::Unavailable
    render json: { error: 'Please try again shortly.' }, status: :service_unavailable
  end

  def verify
    record = PrivacyRequest.find_signed!(params.require(:token).to_s, purpose: 'privacy-verification')
    record.with_lock do
      raise ActiveRecord::RecordNotFound if record.redacted_at || record.created_at < 7.days.ago || record.email_verified_at
      record.update!(email_verified_at: Time.current, status: 'received')
      record.privacy_request_events.create!(action: 'email_verified', status: record.status)
    end
    render json: { request: record.public_payload, tracking_token: record.signed_id(purpose: 'privacy-tracking', expires_in: 30.days) }
  end

  def status
    record = PrivacyRequest.find_signed!(params.require(:token).to_s, purpose: 'privacy-tracking')
    raise ActiveRecord::RecordNotFound unless record.email_verified_at
    render json: { request: record.public_payload }
  end
end
