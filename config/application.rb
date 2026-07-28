require_relative "boot"
require_relative "../app/middleware/api_v1_envelope_middleware"

require "rails/all"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module RailsVite
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 7.1
    config.active_support.to_time_preserves_timezone = :zone

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w(assets tasks))
    config.middleware.use ActionDispatch::Cookies
    config.middleware.use Rack::Attack
    config.middleware.use ApiV1EnvelopeMiddleware
    config.hosts << ENV["ALLOWED_NGROK_HOST"] if Rails.env.development? && ENV["ALLOWED_NGROK_HOST"].present?
    config.hosts << "system.tail54b0b0.ts.net"
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
