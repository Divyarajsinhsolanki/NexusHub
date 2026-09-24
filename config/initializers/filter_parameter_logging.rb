# Be sure to restart your server when you modify this file.

# Configure parameters to be partially matched (e.g. passw matches password) and filtered from the log file.
# Use this to limit dissemination of sensitive information.
# See the ActiveSupport::ParameterFilter documentation for supported notations and behaviors.
Rails.application.config.filter_parameters += [
  :passw,
  :secret,
  :token,
  :_key,
  :api_key,
  :access_key,
  :secret_access_key,
  :authorization,
  :cookie,
  :crypt,
  :salt,
  :certificate,
  :otp,
  :ssn,
  :recaptcha,
  :firebase,
  :smtp_password,
  :postmark,
  :mailer_sender
]
