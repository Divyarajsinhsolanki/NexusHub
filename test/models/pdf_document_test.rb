require "test_helper"

class PdfDocumentTest < ActiveSupport::TestCase
  setup do
    @workspace = Workspace.create!(name: "PDF Workspace", slug: "pdf-workspace", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "pdf-model@example.test")
    Current.user = @user
    Current.workspace = @workspace
  end

  test "creates a private document with an attached original version" do
    source = create_test_pdf
    document = PdfDocuments::Manager.create_from_path!(
      user: @user,
      path: source.path,
      filename: "example.pdf"
    )

    assert_equal @user, document.user
    assert_equal 2, document.page_count
    assert_equal 1, document.versions.count
    assert document.current_version.file.attached?
    assert_equal source.size, document.storage_bytes
  ensure
    source&.close!
  end

  test "undo and redo targets are document-specific" do
    original = create_test_pdf(text: "original")
    changed = create_test_pdf(text: "changed")
    document = PdfDocuments::Manager.create_from_path!(
      user: @user,
      path: original.path,
      filename: "history.pdf"
    )
    second = PdfDocuments::Manager.append_version!(
      document:,
      created_by: @user,
      path: changed.path,
      operation: "test",
      base_version_id: document.current_version_id
    )

    assert_equal document.original_version, document.undo_version
    PdfDocuments::Manager.move_history!(document:, target_version: document.original_version)
    assert_equal second, document.redo_version
  ensure
    original&.close!
    changed&.close!
  end

  test "rejects a stale base version" do
    original = create_test_pdf
    changed = create_test_pdf(text: "changed")
    document = PdfDocuments::Manager.create_from_path!(
      user: @user,
      path: original.path,
      filename: "stale.pdf"
    )

    assert_raises(PdfDocuments::Manager::StaleVersion) do
      PdfDocuments::Manager.append_version!(
        document:,
        created_by: @user,
        path: changed.path,
        operation: "test",
        base_version_id: -1
      )
    end
    assert_equal 1, document.reload.versions.count
  ensure
    original&.close!
    changed&.close!
  end

  test "editing after undo removes the abandoned redo branch" do
    original = create_test_pdf(text: "original")
    changed = create_test_pdf(text: "changed")
    replacement = create_test_pdf(text: "replacement")
    document = PdfDocuments::Manager.create_from_path!(
      user: @user,
      path: original.path,
      filename: "branch.pdf"
    )
    second = PdfDocuments::Manager.append_version!(
      document:,
      created_by: @user,
      path: changed.path,
      operation: "second",
      base_version_id: document.current_version_id
    )
    abandoned = PdfDocuments::Manager.append_version!(
      document:,
      created_by: @user,
      path: changed.path,
      operation: "third",
      base_version_id: document.current_version_id
    )

    assert_equal second, document.reload.undo_version
    PdfDocuments::Manager.move_history!(document:, target_version: second)
    replacement_version = PdfDocuments::Manager.append_version!(
      document:,
      created_by: @user,
      path: replacement.path,
      operation: "replacement",
      base_version_id: second.id
    )

    assert_not PdfDocumentVersion.unscoped.exists?(abandoned.id)
    assert_equal 3, replacement_version.version_number
    assert_nil document.reload.redo_version
  ensure
    original&.close!
    changed&.close!
    replacement&.close!
  end

  test "keeps the original plus the latest twenty edit versions" do
    original = create_test_pdf(text: "original")
    changed = create_test_pdf(text: "changed")

    document = PdfDocuments::Manager.create_from_path!(
      user: @user,
      path: original.path,
      filename: "pruning.pdf"
    )
    21.times do |index|
      PdfDocuments::Manager.append_version!(
        document:,
        created_by: @user,
        path: changed.path,
        operation: "edit-#{index}",
        base_version_id: document.reload.current_version_id
      )
    end

    assert_equal 21, document.versions.count
    assert_equal 1, document.versions.minimum(:version_number)
    assert_equal 22, document.current_version.version_number
    assert_not document.versions.exists?(version_number: 2)
  ensure
    original&.close!
    changed&.close!
  end

  test "enforces document and storage quotas" do
    PdfDocument::MAX_DOCUMENTS_PER_USER.times do |index|
      @user.pdf_documents.create!(
        workspace: @workspace,
        title: "Document #{index}",
        original_filename: "document-#{index}.pdf"
      )
    end

    assert_raises(PdfDocuments::Manager::QuotaExceeded) do
      PdfDocuments::Manager.ensure_document_slot!(@user)
    end

    assert_raises(PdfDocuments::Manager::QuotaExceeded) do
      PdfDocuments::Manager.ensure_storage!(@user, PdfDocument::MAX_STORAGE_PER_USER + 1)
    end
  end

  test "uses workspace SaaS plan limits for PDF quotas" do
    @workspace.update!(plan_key: "growth")
    PdfDocument::MAX_DOCUMENTS_PER_USER.times do |index|
      @user.pdf_documents.create!(
        workspace: @workspace,
        title: "Growth document #{index}",
        original_filename: "growth-document-#{index}.pdf"
      )
    end

    assert_equal 500, PdfDocument.document_limit_for(@user)
    assert_equal 25.gigabytes, PdfDocument.storage_limit_for(@user)
    assert_nothing_raised { PdfDocuments::Manager.ensure_document_slot!(@user) }
  end

  test "rejects non PDF version attachments" do
    document = @user.pdf_documents.create!(
      workspace: @workspace,
      title: "Attachment validation",
      original_filename: "attachment.pdf"
    )
    version = document.versions.build(
      workspace: @workspace,
      created_by: @user,
      version_number: 1,
      operation: "test",
      byte_size: 4
    )
    version.file.attach(
      io: StringIO.new("text"),
      filename: "not-a-pdf.txt",
      content_type: "text/plain"
    )

    assert_not version.valid?
    assert_includes version.errors[:file], "must be a PDF"
  end

  test "purges expired generated artifacts" do
    artifact = @user.pdf_document_artifacts.create!(
      workspace: @workspace,
      kind: "text",
      expires_at: 1.minute.ago
    )
    artifact.file.attach(
      io: StringIO.new("temporary"),
      filename: "temporary.txt",
      content_type: "text/plain"
    )

    PurgePdfDocumentArtifactsJob.perform_now

    assert_not PdfDocumentArtifact.unscoped.exists?(artifact.id)
  end
end
