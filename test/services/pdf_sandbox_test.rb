require "test_helper"
require "rbconfig"

class PdfSandboxTest < ActiveSupport::TestCase
  test "sandbox hides application secrets and removes network access" do
    ENV["PDF_SANDBOX_TEST_SECRET"] = "must-not-leak"
    code = <<~'CODE'
      require 'socket'
      abort 'secret environment leaked' if ENV['PDF_SANDBOX_TEST_SECRET']
      abort 'app filesystem leaked' if File.exist?(ARGV[0])
      begin
        TCPSocket.new('1.1.1.1', 443)
        abort 'network accessible'
      rescue SystemCallError
      end
      puts 'isolated'
    CODE
    # Do not pass the app path as an argument: explicit file arguments are mounts.
    output, error, status = PdfDocuments::Command.capture3(
      [RbConfig.ruby, "-e", code.sub("ARGV[0]", Rails.root.join("config/database.yml").to_s.inspect)], timeout: 5, sandbox: true)
    assert status.success?, error
    assert_equal "isolated\n", output
  ensure
    ENV.delete("PDF_SANDBOX_TEST_SECRET")
  end

  test "output overflow promptly kills noisy processes" do
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    assert_raises(PdfDocuments::Command::OutputLimitExceeded) do
      PdfDocuments::Command.capture3([RbConfig.ruby, "-e", "STDERR.write('x' * 100000); STDERR.flush; sleep 30"], timeout: 10, max_output_bytes: 1024)
    end
    assert_operator Process.clock_gettime(Process::CLOCK_MONOTONIC) - started, :<, 2
  end

  test "missing sandbox executable fails closed" do
    original = ENV["PDF_SANDBOX_EXECUTABLE"]
    ENV["PDF_SANDBOX_EXECUTABLE"] = "/missing/private-pdf-sandbox"
    assert_raises(ArgumentError) { PdfDocuments::Sandbox.wrap(["/bin/true"]) }
  ensure
    ENV["PDF_SANDBOX_EXECUTABLE"] = original
  end
end
