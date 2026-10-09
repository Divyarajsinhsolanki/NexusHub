require "test_helper"
require "rbconfig"

class PdfCommandTest < ActiveSupport::TestCase
  test "captures stdout stderr and the exit status" do
    output, error, status = PdfDocuments::Command.capture3(
      [RbConfig.ruby, "-e", "STDOUT.write('result'); STDERR.write('detail'); exit 3"], timeout: 5
    )
    assert_equal "result", output
    assert_equal "detail", error
    assert_equal 3, status.exitstatus
  end

  test "timeout kills the entire renderer process group and returns promptly" do
    Dir.mktmpdir("pdf-command-timeout") do |directory|
      marker = File.join(directory, "escaped-child.txt")
      code = <<~RUBY
        child = fork do
          Signal.trap('TERM', 'IGNORE')
          sleep 0.7
          File.write(ARGV.fetch(0), 'child survived')
          sleep 10
        end
        Process.wait(child)
      RUBY
      start = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      assert_raises(Timeout::Error) do
        PdfDocuments::Command.capture3([RbConfig.ruby, "-e", code, marker], timeout: 0.2)
      end
      elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - start
      assert_operator elapsed, :<, 1.5
      sleep 0.8
      refute File.exist?(marker), "Renderer descendants must stop when their parent times out."
    end
  end

  test "a renderer that exits but leaves pipe-holding children is also bounded" do
    code = "fork { Signal.trap('TERM', 'IGNORE'); sleep 10 }; exit! 0"
    start = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    assert_raises(Timeout::Error) do
      PdfDocuments::Command.capture3([RbConfig.ruby, "-e", code], timeout: 0.2)
    end
    assert_operator Process.clock_gettime(Process::CLOCK_MONOTONIC) - start, :<, 1.5
  end
end
