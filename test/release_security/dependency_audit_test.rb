require 'minitest/autorun'
require_relative '../../lib/release_security/dependency_audit'
class DependencyAuditTest < Minitest::Test
  def output(high: 0, critical: 0)
    { type: 'auditSummary', data: { vulnerabilities: { high:, critical:, moderate: 1 } } }.to_json + "\n"
  end
  def test_complete_summary_allows_only_no_high_or_critical_findings
    assert_equal 0, ReleaseSecurity::DependencyAudit.verify!(output, 4)['critical']
    assert_raises(ReleaseSecurity::Rejected) { ReleaseSecurity::DependencyAudit.verify!(output(high: 1), 8) }
    assert_raises(ReleaseSecurity::Rejected) { ReleaseSecurity::DependencyAudit.verify!(output(critical: 1), 16) }
  end
  def test_missing_malformed_or_network_error_results_fail_closed
    ['', 'not-json', { type: 'auditSummary', data: {} }.to_json, output + { type: 'error', data: 'unavailable' }.to_json].each do |value|
      assert_raises(ReleaseSecurity::Rejected) { ReleaseSecurity::DependencyAudit.verify!(value, 1) }
    end
    assert_raises(ReleaseSecurity::Rejected) { ReleaseSecurity::DependencyAudit.verify!(output, 127) }
  end
end
