require "open3"
require "timeout"

module PdfDocuments
  # Killing the process group also stops renderers' children and closes pipes.
  # Wrapping capture3 alone in Timeout leaves its ensure waiting for the child.
  class Command
    def self.capture3(command, timeout:)
      Open3.popen3(*command, pgroup: true) do |input, output, error, process|
        input.close
        readers = [output, error].map do |stream|
          Thread.new { stream.read }.tap { |thread| thread.report_on_exception = false }
        end
        completed = false
        begin
          result = Timeout.timeout(timeout) { [readers[0].value, readers[1].value, process.value] }
          completed = true
          result
        ensure
          terminate_group(process) unless completed
          readers.each(&:join)
          [output, error].each { |stream| stream.close unless stream.closed? }
        end
      end
    end

    def self.terminate_group(process)
      Process.kill("TERM", -process.pid)
      process.join(0.1)
      # A descendant can ignore TERM even after the direct child exits.
      Process.kill("KILL", -process.pid)
    rescue Errno::ESRCH
      nil
    ensure
      process.join
    end
    private_class_method :terminate_group
  end
end
