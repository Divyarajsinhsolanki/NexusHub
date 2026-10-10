require "test_helper"
require "minitest/mock"

class KekaClientTest < ActiveSupport::TestCase
  test "rejects non HTTPS URLs credentials and alternate ports" do
    %w[http://keka.example.com https://user:password@keka.example.com https://keka.example.com:8443 https://keka.example.com?target=private].each do |url|
      assert_raises(Keka::Client::UnsafeUrl) { Keka::Client.validate_base_url!(url) }
    end
  end

  test "rejects private loopback metadata mapped and mixed DNS destinations" do
    %w[127.0.0.1 10.1.2.3 169.254.169.254 192.168.1.1 ::1 ::ffff:127.0.0.1 2001:db8::1].each do |address|
      Resolv.stub(:getaddresses, [address]) do
        assert_raises(Keka::Client::UnsafeUrl) { Keka::Client.validate_base_url!("https://keka.example.com") }
      end
    end
    Resolv.stub(:getaddresses, ["8.8.8.8", "127.0.0.1"]) do
      assert_raises(Keka::Client::UnsafeUrl) { Keka::Client.validate_base_url!("https://keka.example.com") }
    end
  end

  test "successful requests retain query parameters and decode JSON" do
    response = Net::HTTPOK.new("1.1", "200", "OK")
    response["content-type"] = "application/json"
    response.instance_variable_set(:@read, true)
    response.body = '{"logs":[{"id":7}]}'
    http = Object.new
    %i[ipaddr= use_ssl= open_timeout= read_timeout=].each { |method| http.define_singleton_method(method) { |_| } }
    http.define_singleton_method(:start) { |&block| block.call(http) }
    request_seen = nil
    http.define_singleton_method(:request) { |request| request_seen = request; response }
    Resolv.stub(:getaddresses, ["8.8.8.8"]) do
      Net::HTTP.stub(:new, http) do
        result = Keka::Client.new(base_url: "https://keka.example.com/api/v1", api_key: "secret").attendance_logs("EMP-1", start_date: "2026-10-01")
        assert result[:success]
        assert_equal({ "logs" => [{ "id" => 7 }] }, result[:data])
      end
    end
    uri = URI.parse(request_seen.path)
    assert_equal "/api/v1/attendance/logs", uri.path
    assert_equal({ "employeeId" => "EMP-1", "from" => "2026-10-01" }, URI.decode_www_form(uri.query).to_h)
  end

  test "pins validated address preserves API path and does not follow redirects" do
    response = Net::HTTPFound.new("1.1", "302", "Found")
    response["location"] = "https://127.0.0.1/secret"
    response.instance_variable_set(:@read, true)
    response.body = "redirect"
    request_seen = nil
    http = Object.new
    http.define_singleton_method(:ipaddr=) { |value| raise "Wrong pin" unless value == "8.8.8.8" }
    http.define_singleton_method(:use_ssl=) { |value| raise "TLS disabled" unless value }
    http.define_singleton_method(:open_timeout=) { |_| }
    http.define_singleton_method(:read_timeout=) { |_| }
    http.define_singleton_method(:start) { |&block| block.call(http) }
    http.define_singleton_method(:request) { |request| request_seen = request; response }
    Resolv.stub(:getaddresses, ["8.8.8.8"]) do
      Net::HTTP.stub(:new, ->(host, port, proxy) { assert_equal "keka.example.com", host; assert_equal 443, port; assert_nil proxy; http }) do
        result = Keka::Client.new(base_url: "https://keka.example.com", api_key: "secret").employee_profile("12/../secret")
        assert_not result[:success]
        assert_equal 302, result[:status]
      end
    end
    assert_equal "/api/v1/employees/12%2F..%2Fsecret", request_seen.path
    assert_equal "Bearer secret", request_seen["Authorization"]
  end
end
