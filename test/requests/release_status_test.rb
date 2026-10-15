require 'test_helper'
require 'minitest/mock'
class ReleaseStatusTest < ActionDispatch::IntegrationTest
  test 'public release identity exposes only revision and tier with caching disabled' do
    ReleaseSecurity::Identity.stub(:sha, 'a' * 40) do
      get '/api/release_status'
      assert_response :success
      assert_equal %w[revision tier], response.parsed_body.keys.sort
      assert_equal 'a' * 40, response.parsed_body['revision']
      assert_includes response.headers['Cache-Control'], 'no-store'
    end
  end
  test 'placeholder deployment identifiers never masquerade as commit evidence' do
    previous = ENV['APP_REVISION']
    ENV['APP_REVISION'] = 'unknown'
    Dir.mktmpdir do |directory|
      Rails.stub(:root, Pathname.new(directory)) do
        assert_nil ReleaseSecurity::Identity.sha
        File.write(File.join(directory, '.release-revision'), 'b' * 40)
        assert_equal 'b' * 40, ReleaseSecurity::Identity.sha
      end
    end
  ensure
    ENV['APP_REVISION'] = previous
  end
end
