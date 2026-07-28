class ApiV1EnvelopeMiddleware
  def initialize(app)
    @app = app
  end

  def call(env)
    status, headers, body = @app.call(env)
    return [status, headers, body] unless env["PATH_INFO"].to_s.start_with?("/api/v1/")
    return [status, headers, body] unless headers["content-type"].to_s.include?("application/json") || status == 204

    raw_body = collect_body(body)
    payload = raw_body.present? ? JSON.parse(raw_body) : nil
    return response(status, headers, payload) if normalized?(payload)

    status >= 400 ? error_response(status, headers, payload) : success_response(status, headers, payload)
  rescue JSON::ParserError
    [status, headers, [raw_body]]
  end

  private

  def collect_body(body)
    chunks = []
    body.each { |chunk| chunks << chunk }
    body.close if body.respond_to?(:close)
    chunks.join
  end

  def normalized?(payload)
    return false unless payload.is_a?(Hash)

    payload.key?("data") || payload["error"].is_a?(Hash)
  end

  def success_response(status, headers, payload)
    next_status = status == 204 ? 200 : status
    data = payload.nil? ? { "deleted" => true } : payload
    response(next_status, headers, { "data" => data })
  end

  def error_response(status, headers, payload)
    raw_error = payload.is_a?(Hash) ? payload["error"] : nil
    details = payload.is_a?(Hash) ? payload["errors"] : nil
    code = raw_error.to_s.parameterize(separator: "_").presence || Rack::Utils::HTTP_STATUS_CODES[status].to_s.parameterize(separator: "_")
    message = if payload.is_a?(Hash)
      payload["message"].presence || raw_error.presence || Array(details).first
    end
    message ||= Rack::Utils::HTTP_STATUS_CODES[status] || "Request failed"

    error = { "code" => code, "message" => message.to_s }
    error["details"] = details if details.present?
    response(status, headers, { "error" => error })
  end

  def response(status, headers, payload)
    encoded = JSON.generate(payload)
    next_headers = headers.merge(
      "content-type" => "application/json; charset=utf-8",
      "content-length" => encoded.bytesize.to_s
    )
    [status, next_headers, [encoded]]
  end
end
