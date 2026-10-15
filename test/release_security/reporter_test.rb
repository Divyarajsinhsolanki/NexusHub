require 'minitest/autorun'
require 'open3'
require 'rbconfig'
require_relative '../support/security_reporter'
class SecurityReporterTest < Minitest::Test
  Result = Struct.new(:assertions, :success, :skip) do
    def passed? = success
    def skipped? = skip
  end
  def test_empty_skipped_failed_and_successful_runs_are_distinguished
    assert_equal false, SecurityRegressionReporter.new.passed?
    reporter = SecurityRegressionReporter.new
    reporter.record(Result.new(3, true, false))
    assert reporter.passed?
    reporter.record(Result.new(0, false, true))
    assert_equal false, reporter.passed?
    reporter = SecurityRegressionReporter.new
    reporter.record(Result.new(1, false, false))
    assert_equal false, reporter.passed?
  end
  def test_real_runner_exit_status_blocks_empty_and_skipped_contracts
    reporter = File.expand_path('../support/security_reporter.rb', __dir__)
    ['', 'class Contract < Minitest::Test; def test_contract; skip "fixture skip"; end; end'].each do |source|
      output, errors, status = Open3.capture3({ 'SECURITY_REGRESSION_RUN' => '1' }, RbConfig.ruby,
        '-rminitest/autorun', '-r', reporter, '-e', source)
      refute status.success?, output + errors
      assert_includes output, 'Security gate:'
    end
    source = 'class Contract < Minitest::Test; def test_contract; assert true; end; end'
    output, errors, status = Open3.capture3({ 'SECURITY_REGRESSION_RUN' => '1' }, RbConfig.ruby,
      '-rminitest/autorun', '-r', reporter, '-e', source)
    assert status.success?, output + errors
  end

end
