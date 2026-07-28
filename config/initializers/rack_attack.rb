class Rack::Attack
  throttle('req/ip', limit: ENV.fetch('RACK_ATTACK_REQUESTS_PER_MINUTE', 300).to_i, period: 1.minute) do |req|
    req.ip if req.path.start_with?('/api')
  end

  throttle('logins/ip', limit: ENV.fetch('RACK_ATTACK_LOGIN_PER_MINUTE', 20).to_i, period: 1.minute) do |req|
    req.ip if ['/api/login', '/api/v1/auth/login'].include?(req.path) && req.post?
  end

  throttle('signup/ip', limit: ENV.fetch('RACK_ATTACK_SIGNUP_PER_HOUR', 10).to_i, period: 1.hour) do |req|
    req.ip if req.path == '/api/users' && req.post?
  end

  throttle('demo-session/ip', limit: ENV.fetch('RACK_ATTACK_DEMO_PER_MINUTE', 20).to_i, period: 1.minute) do |req|
    req.ip if req.path == '/api/demo_session' && req.post?
  end

  self.throttled_responder = lambda do |_request|
    [429, { 'Content-Type' => 'application/json' }, [{ error: 'Rate limit exceeded. Please try again later.' }.to_json]]
  end
end
