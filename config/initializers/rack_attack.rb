class Rack::Attack
  # Counters must survive across Puma workers. Redis is already used by Sidekiq.
  if Rails.env.production?
    cache_url = ENV["RACK_ATTACK_REDIS_URL"].presence || ENV["REDIS_URL"].presence
    self.cache.store = if cache_url
      ActiveSupport::Cache::RedisCacheStore.new(url: cache_url, namespace: "nexus:rate-limits")
    else
      ActiveSupport::Cache::FileStore.new(Rails.root.join("tmp/cache/rate-limits"))
    end
  end

  def self.normalized_path(req)
    req.path.delete_suffix("/").delete_suffix(".json")
  end

  def self.client_ip(req)
    req.env["action_dispatch.remote_ip"]&.to_s || req.ip
  end

  throttle('req/ip', limit: ENV.fetch('RACK_ATTACK_REQUESTS_PER_MINUTE', 300).to_i, period: 1.minute) do |req|
    client_ip(req) if req.path.start_with?('/api/')
  end

  throttle('logins/ip', limit: ENV.fetch('RACK_ATTACK_LOGIN_PER_MINUTE', 20).to_i, period: 1.minute) do |req|
    paths = %w[/api/login /api/v1/auth/login /api/v1/auth/google /users/sign_in]
    client_ip(req) if paths.include?(normalized_path(req)) && req.post?
  end

  throttle('signup/ip', limit: ENV.fetch('RACK_ATTACK_SIGNUP_PER_HOUR', 10).to_i, period: 1.hour) do |req|
    paths = %w[/api/signup /api/v1/auth/signup /api/users /users]
    client_ip(req) if paths.include?(normalized_path(req)) && req.post?
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

  self.throttled_responder = lambda do |request|
    period = request.env.fetch('rack.attack.match_data').fetch(:period)
    [429, { 'Content-Type' => 'application/json', 'Retry-After' => period.to_s },
      [{ error: 'Rate limit exceeded. Please try again later.' }.to_json]]
  end
end
