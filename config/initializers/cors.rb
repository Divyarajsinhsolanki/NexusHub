require Rails.root.join("lib/browser_security")
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*BrowserSecurity.api_origins)
    resource "/api/v1/*", headers: %w[Authorization Content-Type Accept X-Request-Id],
      methods: %i[get post put patch delete options head], expose: %w[X-Request-Id], credentials: false, max_age: 600
    resource "/mcp", headers: %w[Authorization Content-Type Accept Mcp-Session-Id MCP-Protocol-Version],
      methods: %i[get post options head], expose: %w[Mcp-Session-Id X-Request-Id], credentials: false, max_age: 600
  end
  allow do
    origins(*BrowserSecurity.browser_origins)
    resource "/api/*", headers: %w[Authorization Content-Type Accept X-CSRF-Token X-Request-Id],
      methods: %i[get post put patch delete options head], expose: %w[X-CSRF-Token X-Request-Id], credentials: true, max_age: 600,
      if: ->(env) { !env["PATH_INFO"].gsub(%r{/+}, "/").start_with?("/api/v1/") }
  end
end
