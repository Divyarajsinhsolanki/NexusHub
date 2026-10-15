require "open3"
require "timeout"

module PdfDocuments
  class Command
    class OutputLimitExceeded < ArgumentError; end
    MAX_OUTPUT_BYTES = 12 * 1024 * 1024

    def self.capture3(command, timeout:, max_output_bytes: MAX_OUTPUT_BYTES, input_data: nil, sandbox: false, environment: nil)
      raise ArgumentError, "Expected an argument array" unless command.is_a?(Array) && command.all? { |arg| arg.is_a?(String) }
      command = Sandbox.wrap(command) if sandbox
      environment ||= ENV.to_h.slice("PATH", "HOME", "GEM_HOME", "GEM_PATH", "LANG", "LC_ALL", "LD_LIBRARY_PATH")
      options = { pgroup: true, unsetenv_others: true, rlimit_cpu: [timeout.ceil + 1, timeout.ceil + 2],
        rlimit_fsize: 128 * 1024 * 1024, rlimit_nofile: 128, rlimit_core: 0,
        rlimit_as: 2 * 1024 * 1024 * 1024 }
      Open3.popen3(environment, *command, **options) do |input, output, error, process|
        readers = [output, error].map do |stream|
          Thread.new do
            result = +"".b
            while (chunk = stream.read(16 * 1024))
              raise OutputLimitExceeded, "PDF process output exceeded its limit" if result.bytesize + chunk.bytesize > max_output_bytes
              result << chunk
            end
            result
          end.tap { |thread| thread.report_on_exception = false }
        end
        writer = Thread.new { begin; input.write(input_data) if input_data; rescue Errno::EPIPE; ensure; input.close; end }
        completed = false
        begin
          result = Timeout.timeout(timeout) do
            threads = readers + [writer]
            until threads.all? { |thread| !thread.alive? }
              threads.each { |thread| thread.value unless thread.alive? }
              sleep 0.01
            end
            writer.value
            [readers[0].value, readers[1].value, process.value]
          end
          completed = true
          result
        ensure
          terminate_group(process) unless completed
          (readers + [writer]).each { |thread| thread.join rescue nil }
          [output, error].each { |stream| stream.close unless stream.closed? }
        end
      end
    end

    def self.terminate_group(process)
      Process.kill("TERM", -process.pid)
      process.join(0.1)
      Process.kill("KILL", -process.pid)
    rescue Errno::ESRCH
      nil
    ensure
      process.join
    end
    private_class_method :terminate_group
  end
end
