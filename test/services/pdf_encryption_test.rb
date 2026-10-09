require "test_helper"

class PdfEncryptionTest < ActiveSupport::TestCase
  test "protects and unlocks a PDF without persisting the password" do
    workspace = Workspace.create!(name: "Encryption", slug: "encryption", kind: "private")
    user = create_test_user(workspace:, email: "encryption@example.test")
    Current.user = user
    Current.workspace = workspace
    source = create_test_pdf(pages: 1)
    document = PdfDocuments::Manager.create_from_path!(
      user:,
      path: source.path,
      filename: "protected.pdf"
    )
    processor = PdfDocuments::Processor.new(document:, user:)

    processor.protect!(
      password: "StrongPassword!42",
      base_version_id: document.current_version_id
    )
    assert document.reload.encrypted?
    assert_equal 1, document.page_count
    assert_equal 1, document.current_version.page_count

    processor.unlock!(
      password: "StrongPassword!42",
      base_version_id: document.current_version_id
    )
    assert_not document.reload.encrypted?
    assert_equal 1, document.page_count
  ensure
    source&.close!
  end
end
