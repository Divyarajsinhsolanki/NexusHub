class PrivacyRequestMailer < ApplicationMailer
  def verification(request_id)
    @request = PrivacyRequest.find_by(id: request_id)
    return unless @request && !@request.email_verified_at && !@request.redacted_at
    @url = "#{base_url}/privacy-requests#verify=#{@request.signed_id(purpose: 'privacy-verification', expires_in: 24.hours)}"
    @tracking_url = "#{base_url}/privacy-requests#track=#{@request.signed_id(purpose: 'privacy-tracking', expires_in: 30.days)}"
    mail(to: @request.payload.fetch('email'), subject: 'Verify your Nexus Hub privacy request')
  end

  def status_changed(request_id)
    @request = PrivacyRequest.find_by(id: request_id)
    return unless @request&.email_verified_at && !@request.redacted_at
    @url = "#{base_url}/privacy-requests#track=#{@request.signed_id(purpose: 'privacy-tracking', expires_in: 30.days)}"
    mail(to: @request.payload.fetch('email'), subject: 'Your Nexus Hub privacy request has an update')
  end

  private

  def base_url
    value = ENV.fetch('BASE_URL', 'http://localhost:3000').delete_suffix('/')
    uri = URI.parse(value)
    raise ArgumentError, 'Configure a trusted BASE_URL for privacy request email.' unless uri.host && !uri.userinfo && !uri.query && !uri.fragment &&
      (uri.scheme == 'https' || (!Rails.env.production? && uri.scheme == 'http'))
    value
  end
end
