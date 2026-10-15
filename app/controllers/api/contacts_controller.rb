require 'json'
require 'net/http'

class Api::ContactsController < ApplicationController
  protect_from_forgery with: :exception, unless: -> { request.path_info.start_with?("/api/v1/") }
  rescue_from ActionController::InvalidAuthenticityToken do
    render json: { error: "Invalid authenticity token" }, status: :unprocessable_entity
  end

  def create
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
    secret = ENV['RECAPTCHA_SECRET_KEY'].to_s

    return false if token.blank? || secret.blank?

    uri = URI('https://www.google.com/recaptcha/api/siteverify')
    verification = Net::HTTP::Post.new(uri)
    verification.set_form_data(secret: secret, response: token, remoteip: request.remote_ip)
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 3, read_timeout: 5) do |http|
      http.request(verification)
    end
    result = JSON.parse(response.body)

    result['success'] == true &&
      result['action'] == 'contact_form_submit' &&
      result['score'].to_f >= ENV.fetch('RECAPTCHA_MIN_SCORE', '0.5').to_f
  rescue JSON::ParserError, StandardError
    false
  end
end
