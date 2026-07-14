require "active_support/core_ext/integer/time"
require "uri"

Rails.application.configure do
  # Settings specified here will take precedence over those in config/application.rb.

  # Code is not reloaded between requests.
  config.enable_reloading = false

  # Eager load code on boot. This eager loads most of Rails and
  # your application in memory, allowing both threaded web servers
  # and those relying on copy on write to perform better.
  # Rake tasks automatically ignore this option for performance.
  config.eager_load = true

  # Full error reports are disabled and caching is turned on.
  config.consider_all_requests_local = false
  config.action_controller.perform_caching = true

  # Ensures that a master key has been made available in ENV["RAILS_MASTER_KEY"], config/master.key, or an environment
  # key such as config/credentials/production.key. This key is used to decrypt credentials (and other encrypted files).
  # config.require_master_key = true

  # Disable serving static files from `public/`, relying on NGINX/Apache to do so instead.
  # config.public_file_server.enabled = false

  # Enable serving of images, stylesheets, and JavaScripts from an asset server.
  # config.asset_host = "http://assets.example.com"

  # Specifies the header that your server uses for sending files.
  # config.action_dispatch.x_sendfile_header = "X-Sendfile" # for Apache
  # config.action_dispatch.x_sendfile_header = "X-Accel-Redirect" # for NGINX

  config.active_storage.service = ENV.fetch("ACTIVE_STORAGE_SERVICE", "local").to_sym
  config.active_storage.variant_processor = :vips

  # Mount Action Cable outside main process or domain.
  # config.action_cable.mount_path = nil
  # config.action_cable.url = "wss://example.com/cable"
  # config.action_cable.allowed_request_origins = [ "http://example.com", /http:\/\/example.*/ ]

  # Assume all access to the app is happening through a SSL-terminating reverse proxy.
  # Can be used together with config.force_ssl for Strict-Transport-Security and secure cookies.
  # config.assume_ssl = true

  # Force all access to the app over SSL, use Strict-Transport-Security, and use secure cookies.
  config.assume_ssl = true
  config.force_ssl = true
  config.ssl_options = {
    redirect: { exclude: ->(request) { request.path == "/up" } }
  }

  # Log to STDOUT by default
  config.logger = ActiveSupport::Logger.new(STDOUT)
    .tap  { |logger| logger.formatter = ::Logger::Formatter.new }
    .then { |logger| ActiveSupport::TaggedLogging.new(logger) }

  # Prepend all log lines with the following tags.
  config.log_tags = [ :request_id, ->(request) { "workspace=#{Current.workspace&.id || "public"}" } ]

  # "info" includes generic and useful information about system operation, but avoids logging too much
  # information to avoid inadvertent exposure of personally identifiable information (PII). If you
  # want to log everything, set the level to "debug".
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Use a different cache store in production.
  # config.cache_store = :mem_cache_store

  config.active_job.queue_adapter = :sidekiq
  config.active_job.queue_name_prefix = "nexus_hub_production"

  config.action_mailer.perform_caching = false

  # Deliver emails via SMTP using credentials stored in environment variables
  config.action_mailer.delivery_method = :smtp
  config.action_mailer.smtp_settings = {
    address: ENV.fetch("SMTP_ADDRESS", "smtp.dummy.host"),
    port: ENV.fetch("SMTP_PORT", 587).to_i,
    domain: ENV.fetch("SMTP_DOMAIN", "dummy.host"),
    user_name: ENV.fetch("SMTP_USERNAME", "dummy_user"),
    password: ENV.fetch("SMTP_PASSWORD", "dummy_pass"),
    authentication: :plain,
    enable_starttls_auto: true
  }
  app_url = ENV["BASE_URL"].presence || ENV["RENDER_EXTERNAL_URL"].presence || "https://example.com"
  app_uri = URI.parse(app_url.match?(%r{\A[a-z][a-z0-9+\-.]*://}i) ? app_url : "https://#{app_url}")
  app_host = app_uri.host.presence || app_url
  app_protocol = app_uri.scheme.presence || "https"

  config.action_mailer.default_url_options = { host: app_host, protocol: app_protocol }
  

  # Ignore bad email addresses and do not raise email delivery errors.
  # Set this to true and configure the email server for immediate delivery to raise delivery errors.
  # config.action_mailer.raise_delivery_errors = false

  # Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  # the I18n.default_locale when a translation cannot be found).
  config.i18n.fallbacks = true

  # Don't log any deprecations.
  config.active_support.report_deprecations = false

  # Do not dump schema after migrations.
  config.active_record.dump_schema_after_migration = false

  Rails.application.routes.default_url_options[:host] = app_host
  Rails.application.routes.default_url_options[:protocol] = app_protocol

  # Enable DNS rebinding protection and other `Host` header attacks.
  host_from_value = lambda do |value|
    value = value.to_s.strip
    next if value.blank?

    uri_value = value.match?(%r{\A[a-z][a-z0-9+\-.]*://}i) ? value : "https://#{value}"
    URI.parse(uri_value).host.presence || value
  rescue URI::InvalidURIError
    value
  end

  allowed_hosts = [
    ENV["APP_DOMAIN"],
    ENV["BASE_URL"],
    ENV["RENDER_EXTERNAL_HOSTNAME"],
    ENV["RENDER_EXTERNAL_URL"],
    ENV["ALLOWED_HOSTS"]
  ].flat_map { |value| value.to_s.split(",") }
   .filter_map { |value| host_from_value.call(value) }
   .uniq

  config.hosts += allowed_hosts

  # Skip DNS rebinding protection for the default health check endpoint.
  # config.host_authorization = { exclude: ->(request) { request.path == "/up" } }
end
