require "tempfile"

# Bound bytes before Rails/Rack parse JSON or multipart data. Content-Length is
# only an early rejection hint: actual bytes are checked even for chunked input.
class RequestResourceLimits
  def initialize(app)
    @app = app
  end

  def call(env)
    return @app.call(env) unless %w[POST PUT PATCH DELETE].include?(env["REQUEST_METHOD"])
    maximum = limit_for(env)
    length = env["CONTENT_LENGTH"]
    return error(env, 400, "invalid_content_length") if length && !length.match?(/\A\d+\z/)
    return error(env, 413, "payload_too_large") if length && length.to_i > maximum
    return @app.call(env) unless env["rack.input"]

    Tempfile.create("bounded-request", binmode: true) do |file|
      remaining = maximum + 1
      while remaining.positive? && (chunk = env["rack.input"].read([remaining, 16_384].min)) && !chunk.empty?
        file.write(chunk)
        remaining -= chunk.bytesize
      end
      return error(env, 413, "payload_too_large") if file.size > maximum
      file.rewind
      env["rack.input"] = file
      @app.call(env)
    end
  rescue AbusePrevention::RateLimiter::Unavailable
    error(env, 503, "rate_limiter_unavailable")
  end

  private

  def limit_for(env)
    path = env["PATH_INFO"].to_s.gsub(%r{/+}, "/")
    return 32 * 1024 if path.match?(%r{\A/api/(?:v1/)?(?:contacts|privacy_requests(?:/[^/]+)?)(?:\.json)?/?\z})
    return 128 * 1024 if path.match?(%r{\A/(?:users(?:/|\.|\z)|api/(?:login|signup|password|v1/auth)(?:/|\.|\z))})
    return 110 * 1024 * 1024 if env["CONTENT_TYPE"].to_s.start_with?("multipart/form-data")
    return 100 * 1024 * 1024 if path.match?(%r{\A/api/v1/uploads/[^/]+(?:/)?\z})
    2 * 1024 * 1024
  end

  def error(env, status, code)
    message = case status
    when 413 then "Request body exceeds the allowed size."
    when 503 then "Please try again shortly."
    else "Invalid Content-Length."
    end
    payload = env["PATH_INFO"].to_s.start_with?("/api/v1/") ? { error: { code:, message: } } : { error: code, message: }
    headers = { "content-type" => "application/json", "cache-control" => "no-store" }
    headers["retry-after"] = "30" if status == 503
    [status, headers, [JSON.generate(payload)]]
  end
end
