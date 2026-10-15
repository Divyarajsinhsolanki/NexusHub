require "test_helper"

# A real exec cannot observe the parent test transaction. Use dedicated committed
# records and remove only this test's workspace, including on failure.
class PdfExecutionProcessTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  test "a disposable Rails process imports and edits a PDF and rejects an offboarded actor" do
    workspace = Workspace.create!(name: "PDF exec test", slug: "pdf-exec-#{SecureRandom.hex(8)}", kind: "private")
    user = create_test_user(workspace:, email: "exec-#{workspace.id}@example.test")
    source = create_test_pdf(pages: 1)
    result = PdfDocuments::Execution.invoke("upload", { user_id: user.id,
      upload: { path: source.path, filename: "isolated.pdf", content_type: "application/pdf" }, title: "Isolated PDF" })
    Current.user, Current.workspace = user, workspace
    document = user.pdf_documents.find(result.fetch("document_id"))
    assert_equal 1, document.page_count
    operation = user.pdf_document_operations.create!(workspace:, pdf_document: document,
      base_version: document.current_version, kind: "rotate_pages", parameters: { page_numbers: [1], degrees: 90 })
    PdfDocuments::Execution.invoke("operation", { operation_id: operation.id, assets: {} })
    assert_equal "completed", operation.reload.status
    assert_not_equal operation.base_version_id, document.reload.current_version_id
    user.membership_for.update!(status: "suspended", offboarded_at: Time.current)
    error = assert_raises(ArgumentError) do
      PdfDocuments::Execution.invoke("upload", { user_id: user.id,
        upload: { path: source.path, filename: "denied.pdf", content_type: "application/pdf" } })
    end
    assert_match(/Workspace access removed/, error.message)
  ensure
    source&.close!
    Current.workspace = workspace
    workspace&.destroy!
    Current.reset_all
  end
end
