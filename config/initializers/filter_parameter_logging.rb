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
  :recovery_code,
  :provisioning_uri,
  :verification_code,
  :ssn,
  :recaptcha,
  :firebase,
  :smtp_password,
  :postmark,
  :mailer_sender,
  :value,
  :content,
  :license_key,
  :dotenv_content
]

Rails.application.config.filter_parameters += [:ticket, :signed_blob_id]

Rails.application.config.filter_parameters += [:credential, :private_key, :webhook, :service_account, :secret_ciphertext]

Rails.application.config.filter_parameters += [:privacy_request, :tracking_token]
