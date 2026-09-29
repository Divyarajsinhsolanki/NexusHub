require 'json'
require 'net/http'

class Api::ContactsController < ApplicationController
  skip_before_action :verify_authenticity_token

  def create
    unless ContactEndpoint.enabled?
      return render json: { errors: ['Contact form is not available'] }, status: :service_unavailable
    end

    unless valid_captcha?
      return render json: { errors: ['reCAPTCHA verification failed'] }, status: :unprocessable_entity
    end

    contact = Contact.new(contact_params)
    if contact.save
      render json: { message: 'Thank you for your message!' }, status: :created
    else
      render json: { errors: contact.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def contact_params
    params.require(:contact).permit(:name, :email, :message)
  end

  def valid_captcha?
    token = params.dig(:contact, :recaptcha_token).to_s
    secret = ContactEndpoint.secret_key

    return false if token.blank? || secret.blank?

    uri = URI('https://www.google.com/recaptcha/api/siteverify')
    response = Net::HTTP.post_form(
      uri,
      secret: secret,
      response: token,
      remoteip: request.remote_ip
    )
    result = JSON.parse(response.body)

    result['success'] == true &&
      result['action'] == 'contact_form_submit' &&
      result['score'].to_f >= ENV.fetch('RECAPTCHA_MIN_SCORE', '0.5').to_f
  rescue JSON::ParserError, StandardError
    false
  end
end
