require 'json'
require_relative 'gate'
module ReleaseSecurity
  class DependencyAudit
    def self.verify!(output, exit_code)
      events = output.lines.reject { |line| line.strip.empty? }.map { |line| JSON.parse(line) }
      raise Rejected, 'Dependency audit unavailable or incomplete.' unless exit_code && exit_code.between?(0, 31) && events.none? { |event| event['type'] == 'error' }
      counts = events.reverse.find { |event| event['type'] == 'auditSummary' }.fetch('data').fetch('vulnerabilities')
      raise Rejected, 'Invalid dependency audit summary.' unless %w[high critical].all? { |key| counts[key].is_a?(Integer) && counts[key] >= 0 }
      raise Rejected, 'High/critical web dependency vulnerabilities block release.' if counts['high'].positive? || counts['critical'].positive?
      counts
    rescue JSON::ParserError, NoMethodError, KeyError, TypeError
      raise Rejected, 'Dependency audit unavailable or incomplete.'
    end
  end
end
