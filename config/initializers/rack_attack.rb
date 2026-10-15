class Rack::Attack
  # Counters must survive across Puma workers. Redis is already used by Sidekiq.
  if Rails.env.production?
    cache_url = ENV["RACK_ATTACK_REDIS_URL"].presence || ENV["REDIS_URL"].presence
    raise "Configure REDIS_URL or RACK_ATTACK_REDIS_URL for shared abuse counters" unless cache_url
    Rails.application.config.after_initialize do
      Rack::Attack.cache.store = AbusePrevention::RateLimiter.redis_store(url: cache_url)
    end
  elsif Rails.env.development?
    self.cache.store = ActiveSupport::Cache::MemoryStore.new(size: 16.megabytes)
  end

  def self.normalized_path(req)
    req.path.gsub(%r{/+}, "/").delete_suffix("/").delete_suffix(".json")
  end

  def self.client_ip(req)
    req.env["action_dispatch.remote_ip"]&.to_s || req.env["REMOTE_ADDR"]
  end

  throttle('req/ip', limit: ENV.fetch('RACK_ATTACK_REQUESTS_PER_MINUTE', 300).to_i, period: 1.minute) do |req|
    client_ip(req) if normalized_path(req).start_with?('/api/')
  end

  throttle('logins/ip', limit: ENV.fetch('RACK_ATTACK_LOGIN_PER_MINUTE', 20).to_i, period: 1.minute) do |req|
    paths = %w[/api/login /api/v1/auth/login /api/v1/auth/google /users/sign_in]
    client_ip(req) if paths.include?(normalized_path(req)) && req.post?
  end

  throttle('signup/ip', limit: ENV.fetch('RACK_ATTACK_SIGNUP_PER_HOUR', 10).to_i, period: 1.hour) do |req|
    paths = %w[/api/signup /api/v1/auth/signup /api/users /users]
    client_ip(req) if paths.include?(normalized_path(req)) && req.post?
  end

  throttle('invitations/ip', limit: 30, period: 1.hour) do |req|
    client_ip(req) if normalized_path(req).match?(%r{\A/api/(?:v1/)?workspace_invitations(?:/.*)?\z}) && req.post?
  end

  throttle('mfa/ip', limit: 20, period: 1.minute) do |req|
    client_ip(req) if normalized_path(req).match?(%r{\A/api/(?:v1/)?mfa(?:/.*)?\z}) && req.post?
  end

  throttle('password/ip', limit: ENV.fetch('RACK_ATTACK_PASSWORD_PER_HOUR', 10).to_i, period: 1.hour) do |req|
    paths = %w[/api/password/forgot /api/password/reset /api/v1/auth/password/forgot /api/v1/auth/password/reset /users/password]
    client_ip(req) if paths.include?(normalized_path(req)) && %w[POST PATCH PUT].include?(req.request_method)
  end

  throttle('confirmation/ip', limit: ENV.fetch('RACK_ATTACK_CONFIRMATION_PER_HOUR', 10).to_i, period: 1.hour) do |req|
    paths = %w[/users/confirmation /api/v1/auth/confirm]
    client_ip(req) if paths.include?(normalized_path(req)) && req.post?
  end

  throttle('demo-session/ip', limit: ENV.fetch('RACK_ATTACK_DEMO_PER_MINUTE', 20).to_i, period: 1.minute) do |req|
    client_ip(req) if %w[/api/demo_session /api/v1/auth/demo].include?(normalized_path(req)) && req.post?
  end

  throttle('contact/ip', limit: 5, period: 1.hour) do |req|
    client_ip(req) if req.post? && normalized_path(req).match?(%r{\A/api/(?:v1/)?contacts\z})
  end

  throttle('privacy-intake/ip', limit: 10, period: 1.hour) do |req|
    client_ip(req) if req.post? && normalized_path(req).match?(%r{\A/api/(?:v1/)?privacy_requests\z})
  end

  throttle('privacy-links/ip', limit: 60, period: 1.hour) do |req|
    client_ip(req) if req.post? && normalized_path(req).match?(%r{\A/api/(?:v1/)?privacy_requests/(verify|status)\z})
  end

  throttle('mcp/ip', limit: 120, period: 1.minute) do |req|
    client_ip(req) if req.post? && normalized_path(req) == "/mcp"
  end

  throttle('files/ip', limit: 300, period: 1.minute) do |req|
    client_ip(req) if normalized_path(req).start_with?("/rails/active_storage/blobs/")
  end

  throttle('login/account', limit: 30, period: 15.minutes) do |req|
    next unless req.post? && %w[/api/login /api/v1/auth/login /users/sign_in].include?(normalized_path(req))
    values = [req.params["auth"], req.params["user"], req.params].find { |value| value.is_a?(Hash) }
    email = values["email"].to_s.strip.downcase
    Digest::SHA256.hexdigest(email) if email.present?
  end

  self.throttled_responder = lambda do |request|
    period = request.env.fetch('rack.attack.match_data').fetch(:period)
    [429, { 'Content-Type' => 'application/json', 'Retry-After' => period.to_s, 'Cache-Control' => 'no-store' },
      [{ error: 'Rate limit exceeded. Please try again later.' }.to_json]]
  end
end
