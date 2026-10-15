require 'net/http'
require 'json'
require 'uri'
require_relative 'gate'
module ReleaseSecurity
  class Smoke
    def initialize(base_url:, sha:, target:, fetch: nil)
      @base, @sha, @target = URI(base_url), sha, target
      raise Rejected, 'Configure an HTTPS deployment URL, full SHA and tier.' unless @base.is_a?(URI::HTTPS) && @base.host && !@base.userinfo && !@base.query && !@base.fragment && ['', '/'].include?(@base.path) && sha.match?(/\A[0-9a-f]{40}\z/) && %w[staging production].include?(target)
      @fetch = fetch || lambda do |path|
        uri = @base + path
        Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 15) { |http| http.request(Net::HTTP::Get.new(uri)) }
      end
    end
    def verify!
      %w[/up /legal /privacy-requests].each { |path| expect(path, 200) }
      response = expect('/api/release_status', 200)
      identity = JSON.parse(response.body)
      raise Rejected, 'The live revision/tier does not match the reviewed release.' unless identity['revision'] == @sha && identity['tier'] == @target
      %w[/api/workspace_integrations /api/privacy_request_management /api/admin/tables].each { |path| expect(path, 401) }
      true
    rescue JSON::ParserError
      raise Rejected, 'Live release identity is not valid JSON.'
    end
    def expect(path, code)
      response = @fetch.call(path)
      raise Rejected, "Smoke check failed for #{path}; expected HTTP #{code}." unless response.code.to_i == code
      response
    end
  end
end
