require "test_helper"

class RequestResourceLimitsTest < ActiveSupport::TestCase
  test "oversized declared bodies are rejected without reading input" do
    input = Object.new
    def input.read(*) = raise("must not read")
    env = Rack::MockRequest.env_for("/api/login", method: "POST")
    env["CONTENT_LENGTH"], env["rack.input"] = "200000", input
    status, headers, = RequestResourceLimits.new(->(_) { flunk }).call(env)
    assert_equal 413, status
    assert_equal "no-store", headers["cache-control"]
  end

  test "unknown length and lying lengths cannot bypass actual byte limits" do
    [nil, "1"].each do |length|
      env = Rack::MockRequest.env_for("/api/login", method: "POST", input: "x" * 140_000)
      env["CONTENT_LENGTH"] = length
      assert_equal 413, RequestResourceLimits.new(->(_) { flunk }).call(env)[0]
    end
  end

  test "normal bodies remain rewindable and temporary buffers are removed" do
    path = nil
    env = Rack::MockRequest.env_for("/api/messages", method: "POST", input: '{"body":"hello"}')
    app = ->(request) do
      input = request.fetch("rack.input")
      path = input.path
      first = input.read
      input.rewind
      assert_equal first, input.read
      [200, {}, ["ok"]]
    end
    assert_equal 200, RequestResourceLimits.new(app).call(env)[0]
    refute File.exist?(path)
  end

  test "native oversized errors keep the API error shape" do
    env = Rack::MockRequest.env_for("/api/v1/auth/login", method: "POST", "CONTENT_LENGTH" => "200000")
    status, _, body = RequestResourceLimits.new(->(_) { flunk }).call(env)
    assert_equal 413, status
    assert_equal "payload_too_large", JSON.parse(body.join).dig("error", "code")
  end
end

class RateLimitAvailabilityTest < ActiveSupport::TestCase
  test "limiter infrastructure failure returns retryable 503 before downstream dispatch" do
    app = RequestResourceLimits.new(->(_) { raise AbusePrevention::RateLimiter::Unavailable })
    status, headers, = app.call(Rack::MockRequest.env_for("/api/posts"))
    assert_equal 503, status
    assert_equal "30", headers["retry-after"]
  end
end

class RedisRateLimitOutageTest < ActiveSupport::TestCase
  test "the production Redis adapter fails closed on a real connection failure" do
    previous = Rack::Attack.cache.store
    Rack::Attack.cache.store = AbusePrevention::RateLimiter.redis_store(url: "redis://127.0.0.1:1/0")
    app = RequestResourceLimits.new(Rack::Attack.new(->(_) { flunk "unmetered request must not be dispatched" }))
    status, headers, = app.call(Rack::MockRequest.env_for("/api/posts", "REMOTE_ADDR" => "192.0.2.5"))
    assert_equal 503, status
    assert_equal "30", headers["retry-after"]
  ensure
    Rack::Attack.cache.store = previous
  end
end
