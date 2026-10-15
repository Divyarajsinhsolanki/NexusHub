require "test_helper"

class RackAttackTest < ActiveSupport::TestCase
  setup do
    @old_store = Rack::Attack.cache.store
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
    @app = Rack::Attack.new(->(_env) { [200, {}, ["ok"]] })
  end

  teardown do
    Rack::Attack.cache.store = @old_store
  end

  test "signup aliases share a counter and format suffixes cannot bypass it" do
    limit = ENV.fetch("RACK_ATTACK_SIGNUP_PER_HOUR", 10).to_i
    limit.times do |index|
      assert_equal 200, call(index.even? ? "/api/signup" : "/api/v1/auth/signup.json")[0]
    end
    response = call("/users.json")
    assert_equal 429, response[0]
    assert_equal "3600", response[1]["Retry-After"]
  end

  test "password reset and devise aliases share a throttle" do
    limit = ENV.fetch("RACK_ATTACK_PASSWORD_PER_HOUR", 10).to_i
    limit.times { assert_equal 200, call("/api/password/forgot.json")[0] }
    assert_equal 429, call("/api/v1/auth/password/forgot")[0]
    assert_equal 429, call("/users/password")[0]
    assert_equal 200, call("/api/password/forgot", ip: "192.0.2.2")[0]
  end

  test "rate limiting and cookies middleware are installed only once" do
    classes = Rails.application.middleware.map(&:klass)
    assert_equal 1, classes.count(Rack::Attack)
    assert_equal 1, classes.count(ActionDispatch::Cookies)
  end

  private

  def call(path, ip: "192.0.2.1")
    @app.call(Rack::MockRequest.env_for(path, method: "POST", "REMOTE_ADDR" => ip))
  end
end

class AbuseRackAttackTest < ActiveSupport::TestCase
  setup do
    @old_store = Rack::Attack.cache.store
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
    @app = Rack::Attack.new(->(_) { [200, {}, ["ok"]] })
  end
  teardown { Rack::Attack.cache.store = @old_store }

  test "contact aliases share a quota and forwarded headers cannot bypass it" do
    5.times { assert_equal 200, request("/api/contacts.json")[0] }
    assert_equal 429, request("/api/v1/contacts")[0]
    env = Rack::MockRequest.env_for("/api/contacts", method: "POST", "REMOTE_ADDR" => "192.0.2.88", "HTTP_X_FORWARDED_FOR" => "192.0.2.99")
    assert_equal 429, @app.call(env)[0]
  end

  test "login account counters cover different IPs without using raw email keys" do
    30.times do |index|
      assert_equal 200, request("/api/login", ip: "192.0.2.#{index + 1}", email: " Target@example.test ")[0]
    end
    assert_equal 429, request("/api/v1/auth/login.json", ip: "192.0.2.200", email: "target@example.test")[0]
  end

  private

  def request(path, ip: "192.0.2.88", email: nil)
    data = email ? Rack::Utils.build_nested_query(auth: { email: }) : ""
    @app.call(Rack::MockRequest.env_for(path, method: "POST", "REMOTE_ADDR" => ip,
      "CONTENT_TYPE" => "application/x-www-form-urlencoded", input: data))
  end
end
