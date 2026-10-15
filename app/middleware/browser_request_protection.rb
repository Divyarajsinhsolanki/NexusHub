require_relative "../../lib/browser_security"

class BrowserRequestProtection
  SAFE_METHODS = %w[GET HEAD OPTIONS].freeze
  def initialize(app)
    @app = app
  end
  def call(env)
    request = Rack::Request.new(env)
    path = request.path_info.gsub(%r{/+}, "/")
    if !SAFE_METHODS.include?(request.request_method) && path.start_with?("/api/", "/mcp")
      origin = request.get_header("HTTP_ORIGIN")
      stateless = path.start_with?("/api/v1/") || path == "/mcp"
      bearer_only = request.get_header("HTTP_AUTHORIZATION").to_s.match?(/\ABearer /i) &&
        (request.cookies.keys & %w[access_token refresh_token _rails_vite_session]).empty?
      stateless ||= bearer_only
      allowed = stateless ? BrowserSecurity.api_origins : BrowserSecurity.browser_origins
      same_origin = origin == request.base_url
      allowed_origin = origin && allowed.include?(origin)
      # Native clients use no Origin or null. Browser cookie routes never accept null.
      bad_origin = origin && !(same_origin || allowed_origin || (stateless && origin == "null"))
      bad_metadata = request.get_header("HTTP_SEC_FETCH_SITE") == "cross-site" && !allowed_origin && !stateless
      if bad_origin || bad_metadata
        return [403, { "content-type" => "application/json", "cache-control" => "no-store", "x-content-type-options" => "nosniff" }, ['{"error":"origin_not_allowed"}']]
      end
    end
    status, headers, body = @app.call(env)
    if path.start_with?("/api/") || path == "/mcp"
      headers["cache-control"] = "no-store"
      headers["vary"] = (headers["vary"].to_s.split(',').map(&:strip) + %w[Origin Cookie Authorization]).reject(&:empty?).uniq.join(', ')
    end
    [status, headers, body]
  end
end
