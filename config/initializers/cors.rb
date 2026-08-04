Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins ENV.fetch("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://127.0.0.1:8081").split(",").map(&:strip)

    resource ENV.fetch("CORS_ALLOWED_PATH", "/api/*"),
      headers: :any,
      methods: %i[get post put patch delete options head],
      expose: %w[Authorization],
      credentials: true

    resource "/mcp",
      headers: :any,
      methods: %i[get post options head],
      expose: %w[Authorization Mcp-Session-Id],
      credentials: false
  end
end
