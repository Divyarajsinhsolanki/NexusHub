require_relative "boot"
require_relative "../app/middleware/api_v1_envelope_middleware"
require_relative "../app/middleware/browser_request_protection"
require_relative "../app/middleware/private_file_protection"
require_relative "../app/middleware/request_resource_limits"

require "rails/all"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module RailsVite
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 7.1
    # Never run image/PDF metadata extractors or previewers on upload in a web or
    # general-purpose worker. PDF derivatives use the isolated PDF pipeline.
    config.active_storage.analyzers = []
    config.active_storage.previewers = []
    config.active_support.to_time_preserves_timezone = :zone

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w(assets tasks))
    # Rails and the Rack::Attack railtie install their middleware automatically.
    config.middleware.use ApiV1EnvelopeMiddleware
    config.middleware.insert_before Rack::Sendfile, RequestResourceLimits
    config.middleware.insert_before Rack::Sendfile, PrivateFileProtection
    config.middleware.use BrowserRequestProtection
    config.hosts << ENV["ALLOWED_NGROK_HOST"] if Rails.env.development? && ENV["ALLOWED_NGROK_HOST"].present?
    config.hosts << "system.tail54b0b0.ts.net" if Rails.env.development?
    config.hosts << "www.example.com" if Rails.env.test?

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    # config.eager_load_paths << Rails.root.join("extras")
  end
end
