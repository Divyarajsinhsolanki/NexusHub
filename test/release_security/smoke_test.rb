require 'minitest/autorun'
require_relative '../../lib/release_security/smoke'
class ReleaseSmokeTest < Minitest::Test
  def setup
    @sha = 'a' * 40
    @responses = { '/api/release_status' => [200, { revision: @sha, tier: 'staging' }.to_json] }
    @fetch = ->(path) { code, body = @responses.fetch(path, [path.start_with?('/api/') ? 401 : 200, '']); Struct.new(:code, :body).new(code.to_s, body) }
  end
  def tool
    ReleaseSecurity::Smoke.new(base_url: 'https://staging.example.test', sha: @sha, target: 'staging', fetch: @fetch)
  end
  def test_live_expected_release_and_access_denials_pass
    assert tool.verify!
  end
  def test_stale_revision_wrong_tier_login_html_and_redirects_fail
    [{ revision: 'b' * 40, tier: 'staging' }.to_json, { revision: @sha, tier: 'production' }.to_json, '<html>login</html>'].each do |body|
      @responses['/api/release_status'] = [200, body]
      assert_raises(ReleaseSecurity::Rejected) { tool.verify! }
    end
    @responses['/api/release_status'] = [302, '']
    assert_raises(ReleaseSecurity::Rejected) { tool.verify! }
  end
  def test_publicly_exposed_privacy_queue_fails_even_with_correct_revision
    @responses['/api/privacy_request_management'] = [200, 'private records']
    assert_raises(ReleaseSecurity::Rejected) { tool.verify! }
  end
  def test_untrusted_url_forms_are_rejected
    %w[http://staging.example.test https://user:pass@staging.example.test https://staging.example.test/path].each do |url|
      assert_raises(ReleaseSecurity::Rejected) { ReleaseSecurity::Smoke.new(base_url: url, sha: @sha, target: 'staging') }
    end
  end
end
