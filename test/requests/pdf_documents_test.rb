require "test_helper"
require "open3"

class PdfDocumentsTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "PDF API", slug: "pdf-api", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "pdf-api@example.test")
    login_as(@user)
  end

  test "uploads, lists, renames, and deletes a personal PDF" do
    source = create_test_pdf
    upload = Rack::Test::UploadedFile.new(source.path, "application/pdf", original_filename: "contract.pdf")

    before_count = PdfDocument.unscoped.count
    post "/api/pdf_documents", params: { file: upload, title: "Contract" }
    assert_response :created, response.body
    assert_equal before_count + 1, PdfDocument.unscoped.count
    document_id = JSON.parse(response.body).fetch("id")

    get "/api/pdf_documents"
    assert_response :success
    assert_equal "Contract", JSON.parse(response.body).dig("documents", 0, "title")

    patch "/api/pdf_documents/#{document_id}", params: { title: "Signed contract" }
    assert_response :success

    assert_difference("PdfDocument.unscoped.count", -1) do
      delete "/api/pdf_documents/#{document_id}"
    end
    assert_response :no_content
  ensure
    source&.close!
  end

  test "does not expose another user's document" do
    source = create_test_pdf
    Current.user = @user
    Current.workspace = @workspace
    document = PdfDocuments::Manager.create_from_path!(
      user: @user,
      path: source.path,
      filename: "private.pdf"
    )

    other = create_test_user(workspace: @workspace, email: "other-pdf@example.test")
    delete "/api/logout"
    login_as(other)

    get "/api/pdf_documents/#{document.id}"
    assert_response :not_found
  ensure
    source&.close!
  end

  test "returns conflict for a stale operation base version" do
    source = create_test_pdf
    Current.user = @user
    Current.workspace = @workspace
    document = PdfDocuments::Manager.create_from_path!(
      user: @user,
      path: source.path,
      filename: "stale-api.pdf"
    )

    post "/api/pdf_document_operations", params: {
      kind: "rotate_pages",
      pdf_document_id: document.id,
      base_version_id: -1,
      parameters: { page_numbers: [1], degrees: 90 }
    }

    assert_response :conflict
  ensure
    source&.close!
  end

  test "runs an edit operation and exposes undo redo and operation status" do
    source = create_test_pdf
    Current.user = @user
    Current.workspace = @workspace
    document = PdfDocuments::Manager.create_from_path!(
      user: @user,
      path: source.path,
      filename: "history-api.pdf"
    )

    post "/api/pdf_document_operations", params: {
      kind: "rotate_pages",
      pdf_document_id: document.id,
      base_version_id: document.current_version_id,
      parameters: { page_numbers: [1], degrees: 90 }
    }
    assert_response :created, response.body
    operation = JSON.parse(response.body)
    assert_equal "completed", operation.fetch("status")
    assert operation.dig("document", "can_undo")

    get "/api/pdf_document_operations/#{operation.fetch("id")}"
    assert_response :success
    assert_equal "completed", JSON.parse(response.body).fetch("status")

    post "/api/pdf_documents/#{document.id}/undo"
    assert_response :success
    assert JSON.parse(response.body).fetch("can_redo")

    post "/api/pdf_documents/#{document.id}/redo"
    assert_response :success
    assert JSON.parse(response.body).fetch("can_undo")
  ensure
    source&.close!
  end

  test "rejects page zero without changing the current version" do
    source = create_test_pdf
    Current.user = @user
    Current.workspace = @workspace
    document = PdfDocuments::Manager.create_from_path!(
      user: @user,
      path: source.path,
      filename: "invalid-page.pdf"
    )
    original_version_id = document.current_version_id

    post "/api/pdf_document_operations", params: {
      kind: "annotations",
      pdf_document_id: document.id,
      base_version_id: original_version_id,
      parameters: {
        shapes: [{
          type: "rectangle",
          page_number: 0,
          x: 10,
          y: 10,
          width: 50,
          height: 50,
          color: "#111827"
        }]
      }
    }

    assert_response :unprocessable_content
    assert_equal original_version_id, document.reload.current_version_id
    assert_equal 1, PdfDocumentVersion.unscoped.where(pdf_document_id: document.id).count
  ensure
    source&.close!
  end

  test "runs an annotation operation and flattens shapes into a new version" do
    source = create_test_pdf(pages: 1)
    Current.user = @user
    Current.workspace = @workspace
    document = PdfDocuments::Manager.create_from_path!(
      user: @user,
      path: source.path,
      filename: "annotated-api.pdf"
    )
    original_version_id = document.current_version_id

    post "/api/pdf_document_operations", params: {
      kind: "annotations",
      pdf_document_id: document.id,
      base_version_id: document.current_version_id,
      parameters: {
        shapes: [
          {
            type: "text",
            page_number: 1,
            x: 40,
            y: 60,
            width: 180,
            height: 48,
            text: "Reviewed",
            color: "#111827",
            font_size: 18,
            opacity: 1
          },
          {
            type: "highlight",
            page_number: 1,
            x: 38,
            y: 120,
            width: 220,
            height: 28,
            color: "#ca8a04",
            fill_color: "#fde047",
            opacity: 0.35
          },
          {
            type: "rectangle",
            page_number: 1,
            x: 40,
            y: 170,
            width: 120,
            height: 60,
            color: "#dc2626",
            stroke_width: 2
          },
          {
            type: "arrow",
            page_number: 1,
            x: 250,
            y: 200,
            x2: 340,
            y2: 240,
            color: "#2563eb",
            stroke_width: 3
          },
          {
            type: "pen",
            page_number: 1,
            points: [{ x: 300, y: 300 }, { x: 320, y: 310 }, { x: 345, y: 292 }],
            color: "#16a34a",
            stroke_width: 3
          }
        ]
      }
    }

    assert_response :created, response.body
    operation = JSON.parse(response.body)
    assert_equal "completed", operation.fetch("status")
    current_version_id = document.reload.current_version_id
    assert_not_equal original_version_id, current_version_id

    PdfDocumentVersion.unscoped.find(current_version_id).file.open do |file|
      text, = Open3.capture2("pdftotext", file.path, "-")
      assert_includes text, "Reviewed"
    end
  ensure
    source&.close!
  end

  test "indexes PDF text for library and global search" do
    source = create_test_pdf(text: "Apollo searchable contract", pages: 1)
    upload = Rack::Test::UploadedFile.new(source.path, "application/pdf", original_filename: "apollo.pdf")

    post "/api/pdf_documents", params: { file: upload, title: "Apollo Contract" }
    assert_response :created, response.body
    document_id = JSON.parse(response.body).fetch("id")
    document = PdfDocument.unscoped.find(document_id)
    assert_includes document.searchable_text, "Apollo searchable contract"

    get "/api/pdf_documents", params: { q: "searchable contract" }
    assert_response :success
    assert_equal [document_id], JSON.parse(response.body).fetch("documents").map { |item| item.fetch("id") }

    get "/api/search", params: { q: "searchable contract" }
    assert_response :success
    result = JSON.parse(response.body).fetch("results").find { |item| item.fetch("type") == "pdf_document" }
    assert_equal document_id, result.fetch("id")
  ensure
    source&.close!
  end

  private

  def login_as(user)
    post "/api/login", params: {
      auth: { email: user.email, password: "Password!42" }
    }
    assert_response :success
  end
end
