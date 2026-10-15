require "uri"

module BrowserSecurity
  DEVELOPMENT_ORIGINS = %w[http://localhost:5173 http://127.0.0.1:5173 http://localhost:8081 http://127.0.0.1:8081].freeze
  def self.origins(value, production: Rails.env.production?)
    value.to_s.split(",").map(&:strip).reject(&:empty?).map do |origin|
      uri = URI.parse(origin)
      unless %w[http https].include?(uri.scheme) && uri.host && !uri.userinfo && ["", "/"].include?(uri.path) && !uri.query && !uri.fragment && !origin.include?("*") && (!production || uri.scheme == "https")
        raise ArgumentError, "Browser origins must be explicit HTTPS origins in production; wildcards, credentials and paths are forbidden."
      end
      "#{uri.scheme}://#{uri.host}#{uri.port == uri.default_port ? '' : ":#{uri.port}"}"
    end.uniq
  rescue URI::InvalidURIError
    raise ArgumentError, "Invalid browser origin configuration."
  end

  def self.browser_origins
    origins(ENV.fetch("BROWSER_ALLOWED_ORIGINS", ENV.fetch("CORS_ALLOWED_ORIGINS", Rails.env.production? ? "" : DEVELOPMENT_ORIGINS.join(','))))
  end
  def self.api_origins
    origins(ENV.fetch("API_ALLOWED_ORIGINS", ENV.fetch("CORS_ALLOWED_ORIGINS", Rails.env.production? ? "" : DEVELOPMENT_ORIGINS.join(','))))
  end
end
