require 'minitest/autorun'
require_relative '../../lib/release_security/key_policy'
class ReleaseKeyPolicyTest < Minitest::Test
  def test_published_key_is_rejected_in_any_signing_role_without_echoing_it
    old = 'synthetic-retired-signing-key'
    revoked = [Digest::SHA256.hexdigest(old)]
    error = assert_raises(ReleaseSecurity::Rejected) { ReleaseSecurity::KeyPolicy.verify!(['independent-new-key', old], revoked:) }
    refute_includes error.message, old
    assert ReleaseSecurity::KeyPolicy.verify!(['independent-new-key', nil], revoked:)
  end
end
