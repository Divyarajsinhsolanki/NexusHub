require "test_helper"

class PdfPublicationAccessTest < ActiveSupport::TestCase
  test "offboarding during processing prevents publication" do
    workspace = Workspace.create!(name: "PDF publication", slug: "pdf-publication", kind: "private")
    user = create_test_user(workspace:, email: "pdf-publication@example.test")
    Current.user, Current.workspace = user, workspace
    user.membership_for.update!(status: "suspended", offboarded_at: Time.current)
    source = create_test_pdf(pages: 1)
    assert_no_difference("PdfDocument.unscoped.count") do
      error = assert_raises(ArgumentError) do
        PdfDocuments::Manager.create_from_path!(user:, path: source.path, filename: "rejected.pdf")
      end
      assert_match(/Workspace access removed/, error.message)
    end
  ensure
    source&.close!
  end
end
