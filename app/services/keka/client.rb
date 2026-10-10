require "net/http"
require "resolv"
require "ipaddr"
require "timeout"

module Keka
  class Client
    DEFAULT_TIMEOUT = 10
    class UnsafeUrl < StandardError; end
    BLOCKED_NETWORKS = %w[0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.0.2.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/4 240.0.0.0/4].map { |range| IPAddr.new(range) }.freeze

    def self.validate_base_url!(value)
      uri = URI.parse(value.to_s.strip)
      unless uri.is_a?(URI::HTTPS) && uri.hostname.present? && uri.port == 443 && uri.userinfo.nil? && uri.query.nil? && uri.fragment.nil?
        raise UnsafeUrl, "Keka URL must use HTTPS on port 443 without credentials, a query, or a fragment"
      end
      addresses = Timeout.timeout(DEFAULT_TIMEOUT) { Resolv.getaddresses(uri.hostname) }
      if addresses.empty? || addresses.any? { |address| !public_address?(address) }
        raise UnsafeUrl, "Keka URL must resolve only to public internet addresses"
      end
      [uri, addresses.first]
    rescue URI::InvalidURIError, Resolv::ResolvError, Timeout::Error
      raise UnsafeUrl, "Keka URL could not be validated"
    end

    def self.public_address?(address)
      ip = IPAddr.new(address)
      if ip.ipv6?
        return IPAddr.new("2000::/3").include?(ip) && !IPAddr.new("2001::/23").include?(ip) && !IPAddr.new("2001:db8::/32").include?(ip)
      end
      BLOCKED_NETWORKS.none? { |network| network.include?(ip) }
    rescue IPAddr::InvalidAddressError
      false
    end

    def initialize(base_url:, api_key:)
      @base_url = normalize_base_url(base_url)
      @api_key = api_key
    end

    def employee_profile(employee_id)
      get("/employees/#{ERB::Util.url_encode(employee_id.to_s)}")
    end

    def attendance_logs(employee_id, start_date: nil, end_date: nil)
      params = { employeeId: employee_id }
      params[:from] = start_date if start_date
      params[:to] = end_date if end_date
      get("/attendance/logs", params)
    end

    def timesheets(employee_id, start_date: nil, end_date: nil)
      params = { employeeId: employee_id }
      params[:from] = start_date if start_date
      params[:to] = end_date if end_date
      get("/time/entries", params)
    end

    def leave_balances(employee_id)
      get("/leave/balance", { employeeId: employee_id })
    end

    private

    def normalize_base_url(base_url)
      return "" if base_url.blank?

      trimmed = base_url.to_s.strip
      trimmed = trimmed.chomp("/")
      trimmed.end_with?("/api/v1") ? trimmed : "#{trimmed}/api/v1"
    end

    def get(path, params = {})
      # Validate every request and pin its resolved address so DNS cannot change
      # between the safety check and connection. Keep TLS verification on the host.
      uri, address = self.class.validate_base_url!(@base_url)
      uri.path = "#{uri.path.chomp('/')}#{path}"
      uri.query = URI.encode_www_form(params) if params.present?
      http = Net::HTTP.new(uri.hostname, uri.port, nil)
      http.ipaddr = address
      http.use_ssl = true
      http.open_timeout = DEFAULT_TIMEOUT
      http.read_timeout = DEFAULT_TIMEOUT
      request = Net::HTTP::Get.new(uri.request_uri)
      request["Accept"] = "application/json"
      request["Authorization"] = "Bearer #{@api_key}"
      request["x-api-key"] = @api_key
      # Redirects are deliberately returned as errors; never forward credentials.
      response = http.start { |connection| connection.request(request) }
      body = response.body
      body = JSON.parse(body) if response["content-type"].to_s.match?(/json/i) && body.present?
      status = response.code.to_i
      if response.is_a?(Net::HTTPSuccess)
        { success: true, status: status, data: body }
      else
        { success: false, status: status, error: body.presence || response.message }
      end
    rescue Timeout::Error
      { success: false, error: "Request to Keka timed out", error_type: :timeout }
    rescue SocketError, SystemCallError, IOError, OpenSSL::SSL::SSLError
      { success: false, error: "Could not connect to Keka", error_type: :connection_failed }
    rescue JSON::ParserError
      { success: false, error: "Keka returned invalid JSON", error_type: :request_error }
    end
  end
end
