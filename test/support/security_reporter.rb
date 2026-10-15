require 'minitest'
class SecurityRegressionReporter < Minitest::AbstractReporter
  def initialize
    @runs = @skips = @failures = @assertions = 0
  end
  def record(result)
    @runs += 1
    @assertions += result.assertions
    @skips += 1 if result.skipped?
    @failures += 1 unless result.passed?
  end
  def passed?
    @runs.positive? && @skips.zero? && @failures.zero?
  end
  def report
    puts "Security gate: #{@runs} tests, #{@assertions} assertions, #{@skips} skips, #{@failures} failed results."
    abort "Security gate ran no tests." if @runs.zero?
  end
end
Minitest.extensions << 'security_gate' if ENV['SECURITY_REGRESSION_RUN'] == '1'
def Minitest.plugin_security_gate_init(_options)
  reporter << SecurityRegressionReporter.new
end
