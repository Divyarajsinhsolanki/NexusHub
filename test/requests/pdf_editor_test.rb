require "test_helper"
require "zlib"

class PdfEditorTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "PDF Editor API", slug: "pdf-editor-api", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "pdf-editor-api@example.test")
    login(@user)
    @source = create_test_pdf(pages: 2)
    Current.user, Current.workspace = @user, @workspace
    @document = PdfDocuments::Manager.create_from_path!(user: @user, path: @source.path, filename: "editor.pdf")
  end

  teardown do
    @source.close!
    @image&.close!
  end

  test "multipart autosave exposes persistent objects and scoped asset and background URLs" do
    @image = Tempfile.new(["editor-image-", ".png"], binmode: true)
    chunk = ->(type, data) { [data.bytesize].pack("N") + type + data + [Zlib.crc32(type + data)].pack("N") }
    @image.write("\x89PNG\r\n\x1a\n".b + chunk.call("IHDR".b, [10, 10, 8, 2, 0, 0, 0].pack("NNCCCCC")) +
      chunk.call("IDAT".b, Zlib::Deflate.deflate(("\x00".b + "\xff\x00\x00".b * 10) * 10)) + chunk.call("IEND".b, "".b))
    @image.flush
    shape = { id: "owned-image", type: "signature", asset_id: "upload-key", page_number: 1, x: 10, y: 20, width: 100, height: 100 }
    post "/api/pdf_document_operations", params: { kind: "save_objects", pdf_document_id: @document.id,
      base_version_id: @document.current_version_id, parameters: { objects: [shape] }.to_json,
      assets: { "upload-key" => Rack::Test::UploadedFile.new(@image.path, "image/png") } }
    assert_response :created, response.body
    state = JSON.parse(response.body).dig("document", "editor_state")
    assert_equal "upload-key", state.fetch("objects").first.fetch("asset_id")
    assert_equal state.fetch("assets").fetch("upload-key"), state.fetch("objects").first.fetch("asset_url")
    assert_equal 612, state.dig("page_sizes", "1", "width")
    get state.fetch("background_url")
    assert_response :redirect
    follow_redirect!
    assert_equal "application/pdf", response.media_type
    get state.fetch("objects").first.fetch("asset_url")
    assert_response :redirect
    follow_redirect!
    assert_equal "image/png", response.media_type

    get "/api/pdf_documents/#{@document.id}"
    assert_response :success
    assert_equal state, JSON.parse(response.body).fetch("editor_state")
    other = create_test_user(workspace: @workspace, email: "other-pdf-editor@example.test")
    delete "/api/logout"
    login(other)
    get state.fetch("background_url")
    assert_response :not_found
    get state.fetch("assets").fetch("upload-key")
    assert_response :not_found
  end

  test "rejects malformed object payload and unsupported glyphs with useful client errors" do
    post "/api/pdf_document_operations", params: { kind: "save_objects", pdf_document_id: @document.id,
      base_version_id: @document.current_version_id, parameters: "[]" }
    assert_response :unprocessable_content
    assert_equal "Operation parameters must be an object.", JSON.parse(response.body).fetch("error")
    shape = { id: "bad-text", type: "text", page_number: 1, x: 10, y: 20, width: 100, height: 40, text: "नमस्ते" }
    post "/api/pdf_document_operations", params: { kind: "save_objects", pdf_document_id: @document.id,
      base_version_id: @document.current_version_id, parameters: { objects: [shape] } }
    assert_response :unprocessable_content
    assert_includes JSON.parse(response.body).fetch("error"), "font does not support"
    assert_equal 1, PdfDocumentVersion.unscoped.where(pdf_document: @document).count
  end

  test "malformed coordinates assets and version identifiers return client errors" do
    base = @document.current_version_id
    shape = { id: "bad", type: "rectangle", page_number: nil, x: 10, y: 20, width: 100, height: 40 }
    [
      { base_version_id: [base], parameters: { objects: [] } },
      { base_version_id: "#{base}junk", parameters: { objects: [] } },
      { base_version_id: base, parameters: { objects: [shape] } },
      { base_version_id: base, parameters: { objects: [] }, assets: "invalid" },
      { base_version_id: base, parameters: { objects: [] }, assets: { invalid: "invalid" } }
    ].each do |payload|
      post "/api/pdf_document_operations", params: { kind: "save_objects", pdf_document_id: @document.id }.merge(payload)
      assert_response :unprocessable_content, response.body
      assert JSON.parse(response.body).fetch("error").present?
      assert_equal base, @document.reload.current_version_id
    end
  end

  test "library omits editor snapshots while detail and downloads expose the composed PDF" do
    post "/api/pdf_document_operations", params: { kind: "save_objects", pdf_document_id: @document.id,
      base_version_id: @document.current_version_id, parameters: { objects: [{ id: "saved", type: "text", page_number: 1,
      x: 40, y: 100, width: 250, height: 40, text: "Download contains current edits" }] } }
    assert_response :created, response.body
    get "/api/pdf_documents"
    assert_response :success
    refute JSON.parse(response.body).fetch("documents").first.key?("editor_state")
    get "/api/pdf_documents/#{@document.id}/download"
    assert_response :redirect
    follow_redirect!
    follow_redirect! if response.redirect?
    assert_response :success
    assert_equal "application/pdf", response.media_type
    Tempfile.create(["editor-download-test-", ".pdf"], binmode: true) do |file|
      file.write(response.body)
      file.flush
      assert_includes PdfDocuments::TextExtractor.call(file.path, max_bytes: 1.megabyte), "Download contains current edits"
    end
  end

  test "recent operations expose queued and completed jobs after reopening" do
    post "/api/pdf_document_operations", params: { kind: "extract_text", pdf_document_id: @document.id,
      base_version_id: @document.current_version_id, parameters: {} }
    assert_response :accepted
    operation = PdfDocumentOperation.unscoped.find(JSON.parse(response.body).fetch("id"))
    assert operation.source_files.attached?
    get "/api/pdf_documents/#{@document.id}/operations"
    assert_response :success
    assert_equal "queued", JSON.parse(response.body).fetch("operations").first.fetch("status")
    PdfDocumentOperationJob.perform_now(operation.id)
    get "/api/pdf_documents/#{@document.id}/operations"
    record = JSON.parse(response.body).fetch("operations").first
    assert_equal "completed", record.fetch("status")
    assert_equal "text", record.fetch("artifacts").first.fetch("kind")
    assert_empty operation.reload.source_files
    get "/api/pdf_document_operations"
    assert_response :success
  end

  test "protected versions hide editor state and remove the plaintext thumbnail" do
    post "/api/pdf_document_operations", params: { kind: "save_objects", pdf_document_id: @document.id,
      base_version_id: @document.current_version_id, parameters: { objects: [{ id: "note", type: "text", page_number: 1,
      x: 10, y: 20, width: 100, height: 40, text: "Private" }] } }
    state = JSON.parse(response.body).dig("document", "editor_state")
    @document.reload
    post "/api/pdf_document_operations", params: { kind: "protect", pdf_document_id: @document.id,
      base_version_id: @document.current_version_id, password: "StrongPassword42", parameters: {} }
    assert_response :created
    locked = JSON.parse(response.body).fetch("document")
    assert_nil locked["thumbnail_url"]
    assert_empty locked.dig("editor_state", "objects")
    get state.fetch("background_url")
    assert_response :not_found
    refute @document.reload.thumbnail.attached?
  end

  private

  def login(user)
    post "/api/login", params: { auth: { email: user.email, password: "Password!42" } }
    assert_response :success
  end
end
