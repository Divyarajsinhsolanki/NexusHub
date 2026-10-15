require "test_helper"
require "minitest/mock"

class PdfExecutionFailureTest < ActiveSupport::TestCase
  test "a timed out child fails only its own lease" do
    check_timeout(replacement: false)
  end

  test "a timed out child cannot fail a replacement worker's lease" do
    check_timeout(replacement: true)
  end

  test "killed processing removes its private temporary directory" do
    directory = nil
    child = lambda do |*_, **options|
      directory = options.fetch(:environment).fetch("TMPDIR")
      File.write(File.join(directory, "partial-sensitive-output.pdf"), "%PDF partial")
      raise Timeout::Error
    end
    PdfDocuments::Command.stub(:capture3, child) do
      assert_raises(ArgumentError) { PdfDocuments::Execution.invoke("upload", {}) }
    end
    refute Dir.exist?(directory)
  end

  private

  def check_timeout(replacement:)
    workspace = Workspace.create!(name: "Execution fencing", slug: "exec-fencing", kind: "private")
    user = create_test_user(workspace:, email: "fencing@example.test")
    Current.user, Current.workspace = user, workspace
    operation = user.pdf_document_operations.create!(workspace:, kind: "merge", parameters: {})
    child = lambda do |_action, arguments|
      token = replacement ? "replacement-token" : arguments.fetch(:execution_token)
      operation.update!(status: "processing", parameters: { PdfDocumentOperation::PROCESSING_LEASE_KEY => { "token" => token, "expires_at" => 5.minutes.from_now.iso8601 } })
      raise Timeout::Error
    end
    PdfDocuments::Execution.stub(:enabled?, true) do
      PdfDocuments::Execution.stub(:invoke, child) do
        assert_raises(ArgumentError) { PdfDocuments::Execution.operation(operation) }
      end
    end
    assert_equal replacement ? "processing" : "failed", operation.reload.status
  end
end
