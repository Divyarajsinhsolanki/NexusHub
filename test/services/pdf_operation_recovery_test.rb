require "test_helper"
require "active_job/test_helper"

class PdfOperationRecoveryTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  setup do
    @workspace = Workspace.create!(name: "PDF Recovery", slug: "pdf-recovery", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "pdf-recovery@example.test")
    Current.workspace, Current.user = @workspace, @user
    @source = create_test_pdf(text: "Captured recovery source", pages: 1)
    @document = PdfDocuments::Manager.create_from_path!(user: @user, path: @source.path, filename: "recovery.pdf")
    @operation = @user.pdf_document_operations.create!(workspace: @workspace, pdf_document: @document,
      base_version: @document.current_version, kind: "extract_text", parameters: {})
    PdfDocuments::Sources.capture!(@operation, [@document.current_version])
    clear_enqueued_jobs
  end

  teardown do
    @source&.close!
    clear_enqueued_jobs
  end

  test "expired interrupted jobs are reclaimed once and retain their captured source" do
    expired = { "token" => "dead-worker", "expires_at" => 1.minute.ago.iso8601(6) }
    @operation.update!(status: "processing", started_at: 10.minutes.ago,
      parameters: @operation.parameters.merge(PdfDocumentOperation::PROCESSING_LEASE_KEY => expired))
    assert_difference("PdfDocumentArtifact.count", 1) do
      run_job
    end
    assert_equal "completed", @operation.reload.status
    assert_not_equal "dead-worker", @operation.parameters.dig(PdfDocumentOperation::PROCESSING_LEASE_KEY, "token")
    assert_includes @operation.artifacts.first.file.download, "Captured recovery source"
    assert_empty @operation.source_files
    assert_no_difference("PdfDocumentArtifact.count") { run_job }
  end

  test "legacy interrupted processing jobs without a lease can recover" do
    @operation.update!(status: "processing", started_at: 10.minutes.ago)
    run_job
    assert_equal "completed", @operation.reload.status
    assert_equal 1, @operation.artifacts.count
  end

  test "delivery during a live lease keeps an automatic recovery delivery queued" do
    expires_at = 4.minutes.from_now
    @operation.update!(status: "processing", started_at: Time.current,
      parameters: @operation.parameters.merge(PdfDocumentOperation::PROCESSING_LEASE_KEY => {
        "token" => "healthy-worker", "expires_at" => expires_at.iso8601(6)
      }))
    assert_no_difference("PdfDocumentArtifact.count") do
      assert_enqueued_jobs 1, only: PdfDocumentOperationJob do
        run_job
      end
    end
    recovery = enqueued_jobs.find { |job| job[:job] == PdfDocumentOperationJob }
    assert_in_delta expires_at.to_f, recovery.fetch(:at), 1
    assert_equal "processing", @operation.reload.status
    assert @operation.source_files.attached?
  end

  test "status checks enqueue legacy interrupted operations once per polling window" do
    @operation.update!(status: "processing", started_at: 10.minutes.ago)
    assert_enqueued_jobs 1, only: PdfDocumentOperationJob do
      3.times { PdfDocuments::OperationRunner.recover_expired!(@operation) }
    end
    run_job
    assert_equal "completed", @operation.reload.status
    assert_no_enqueued_jobs only: PdfDocumentOperationJob do
      PdfDocuments::OperationRunner.recover_expired!(@operation)
    end
  end

  test "a reclaimed worker cannot publish or mark the new worker failed" do
    runner = PdfDocuments::OperationRunner.new(@operation)
    record, user, document = @operation, @user, @document
    runner.define_singleton_method(:execute) do |**|
      replacement = PdfDocumentOperation.find(record.id)
      replacement.update!(parameters: replacement.parameters.merge(PdfDocumentOperation::PROCESSING_LEASE_KEY => {
        "token" => "replacement-worker", "expires_at" => 5.minutes.from_now.iso8601(6)
      }))
      PdfDocuments::Processor.new(document:, user:, operation_record: record).extract_text!
    end
    assert_no_difference("PdfDocumentArtifact.count") do
      assert_raises(PdfDocumentOperation::LostProcessingLease) { runner.run! }
    end
    assert_equal "processing", @operation.reload.status
    assert_equal "replacement-worker", @operation.parameters.dig(PdfDocumentOperation::PROCESSING_LEASE_KEY, "token")
    assert @operation.source_files.attached?
  end

  test "version and derived document publication reject a superseded lease" do
    @operation.update!(status: "processing", parameters: @operation.parameters.merge(
      PdfDocumentOperation::PROCESSING_LEASE_KEY => { "token" => "replacement-worker", "expires_at" => 5.minutes.from_now.iso8601(6) }
    ))
    @operation.processing_lease_token = "old-worker"
    current = @document.current_version_id
    assert_no_difference("PdfDocumentVersion.count") do
      assert_raises(PdfDocumentOperation::LostProcessingLease) do
        PdfDocuments::Manager.append_version!(document: @document, created_by: @user, path: @source.path,
          operation: "rotate_pages", base_version_id: current, operation_record: @operation)
      end
    end
    assert_no_difference("PdfDocument.count") do
      assert_raises(PdfDocumentOperation::LostProcessingLease) do
        PdfDocuments::Manager.publish_documents!(user: @user, operation: "extract_pages", operation_record: @operation,
          outputs: [{ path: @source.path, filename: "recovered.pdf" }])
      end
    end
    assert_equal current, @document.reload.current_version_id
    assert_equal "processing", @operation.reload.status
  end

  private

  def run_job
    PdfDocumentOperationJob.perform_now(@operation.id)
  ensure
    Current.workspace, Current.user = @workspace, @user
  end
end
