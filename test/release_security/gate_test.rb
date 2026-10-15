require 'minitest/autorun'
require_relative '../../lib/release_security/gate'

class ReleaseGateTest < Minitest::Test
  def setup
    @now = Time.utc(2026, 10, 15)
    @sha = 'a' * 40
    @run = { 'id' => 1, 'head_sha' => @sha, 'head_repository' => { 'full_name' => 'owner/repo' }, 'event' => 'push',
      'path' => '.github/workflows/ci.yml', 'head_branch' => 'main', 'status' => 'completed', 'conclusion' => 'success', 'updated_at' => @now.iso8601 }
    @deployment = { 'id' => 8, 'sha' => @sha, 'environment' => 'staging' }
    @status = { 'id' => 12, 'state' => 'success', 'created_at' => @now.iso8601, 'log_url' => 'https://github.com/owner/repo/actions/runs/9/job/10' }
    @stage_run = @run.merge('id' => 9, 'path' => '.github/workflows/deploy-eb.yml', 'event' => 'workflow_dispatch')
    @runs = [@run]
    @statuses = [@status]
    answers = { 'repos/owner/repo/actions/workflows/ci.yml/runs' => { 'workflow_runs' => @runs },
      'repos/owner/repo/deployments' => [@deployment], 'repos/owner/repo/deployments/8/statuses' => @statuses,
      'repos/owner/repo/actions/runs/9' => @stage_run }
    client = Object.new
    client.define_singleton_method(:get) { |path, *_| answers.fetch(path) }
    @gate = ReleaseSecurity::Gate.new(repository: 'owner/repo', sha: @sha, client:, now: @now)
  end
  def rejected(target = 'production')
    assert_raises(ReleaseSecurity::Rejected) { @gate.verify!(target:) }
  end
  def test_success_requires_matching_completed_ci_and_staging
    assert_equal @sha, @gate.verify!(target: 'production')[:sha]
    @statuses.clear
    assert @gate.verify!(target: 'staging')
    rejected
  end
  def test_explicit_direct_production_keeps_ci_and_branch_checks_without_staging
    @statuses.clear
    proof = @gate.verify!(target: 'production', require_staging: false)
    assert_equal false, proof[:staging_required]
    @run['conclusion'] = 'failure'
    assert_raises(ReleaseSecurity::Rejected) { @gate.verify!(target: 'production', require_staging: false) }
    @run['conclusion'] = 'success'
    @run['head_branch'] = 'feature'
    assert_raises(ReleaseSecurity::Rejected) { @gate.verify!(target: 'production', require_staging: false) }
  end
  def test_wrong_sha_fork_and_pr_evidence_cannot_authorize_release
    @run['head_sha'] = 'b' * 40; rejected
    @run['head_sha'] = @sha
    @run['head_repository']['full_name'] = 'attacker/repo'; rejected
    @run['head_repository']['full_name'] = 'owner/repo'
    @run['event'] = 'pull_request'; rejected
  end
  def test_old_success_does_not_override_new_failure_or_in_progress_run
    @runs << @run.merge('id' => 2, 'conclusion' => 'failure')
    rejected
    @runs.last.merge!('conclusion' => nil, 'status' => 'in_progress')
    rejected
  end
  def test_stale_future_and_non_main_ci_are_blocked
    @run['updated_at'] = (@now - 86401).iso8601; rejected
    @run['updated_at'] = (@now + 10).iso8601; rejected
    @run['updated_at'] = @now.iso8601
    @run['head_branch'] = 'feature'; rejected
  end
  def test_wrong_or_replaced_staging_deployment_is_blocked
    @deployment['sha'] = 'b' * 40; rejected
    @deployment['sha'] = @sha
    @statuses << @status.merge('id' => 13, 'state' => 'failure'); rejected
  end
  def test_manual_status_or_unrelated_workflow_is_not_staging_proof
    @status['log_url'] = 'https://attacker.test/actions/runs/9'; rejected
    @status['log_url'] = 'https://github.com/owner/repo/actions/runs/9'
    @stage_run['path'] = '.github/workflows/untrusted.yml'; rejected
    @stage_run['path'] = '.github/workflows/deploy-eb.yml'
    @stage_run['head_sha'] = 'b' * 40; rejected
  end
  def test_stale_staging_and_cancelled_workflow_are_blocked
    @status['created_at'] = (@now - 8 * 86400).iso8601; rejected
    @status['created_at'] = @now.iso8601
    @stage_run['conclusion'] = 'cancelled'; rejected
  end
  def test_api_failure_and_invalid_evidence_fail_closed
    @runs << nil; rejected
    @runs.pop
    @run.delete('updated_at'); rejected
    assert_raises(ReleaseSecurity::Rejected) { ReleaseSecurity::GitHubClient.new(token: nil) }
    assert_raises(ReleaseSecurity::Rejected) { ReleaseSecurity::Gate.new(repository: '../malicious', sha: @sha, client: nil) }
    rejected('invalid-target')
  end
end
