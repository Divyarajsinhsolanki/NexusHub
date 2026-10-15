require "test_helper"
require "digest"

class PrivateFilesTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Private files", slug: "private-files", kind: "private")
    @owner = create_test_user(workspace: @workspace, email: "file-owner@example.test")
    @other = create_test_user(workspace: @workspace, email: "file-other@example.test")
    Current.user, Current.workspace = @owner, @workspace
    source = create_test_pdf(pages: 1)
    @document = PdfDocuments::Manager.create_from_path!(user: @owner, path: source.path, filename: "private.pdf")
    @blob = @document.current_version.file.blob
    @url = rails_blob_path(@blob, only_path: true)
    source.close!
    Current.reset_all
  end

  test "copied signed links require authentication and record ownership" do
    get @url
    assert_response :unauthorized
    login(@other)
    get @url
    assert_response :not_found
    login(@owner)
    get @url
    assert_response :success
    assert response.body.start_with?("%PDF")
    assert_includes response.headers["Cache-Control"], "no-store"
    refute response.headers["Location"]
  end

  test "cross tenant signed links and removed membership are denied" do
    workspace = Workspace.create!(name: "Outside", slug: "file-outside", kind: "private")
    outsider = create_test_user(workspace:, email: "file-outside@example.test")
    login(outsider)
    get @url
    assert_response :not_found
    login(@owner)
    @owner.membership_for.update!(status: "suspended", offboarded_at: Time.current)
    get @url
    assert_response :unauthorized
  end

  test "native tickets are scoped to a file and revoked with their session" do
    token, session = native_session(@owner)
    post "/api/v1/file_access", params: { signed_id: @blob.signed_id }, headers: { "Authorization" => "Bearer #{token}" }, as: :json
    assert_response :success
    ticket_url = response.parsed_body.dig("data", "url")
    get ticket_url
    assert_response :success
    session.revoke!
    get ticket_url
    assert_response :unauthorized
  end

  test "native tickets expire and never override a different bearer identity" do
    token, = native_session(@owner)
    post "/api/v1/file_access", params: { signed_id: @blob.signed_id }, headers: { "Authorization" => "Bearer #{token}" }, as: :json
    url = response.parsed_body.dig("data", "url")
    other_token, = native_session(@other)
    get url, headers: { "Authorization" => "Bearer #{other_token}" }
    assert_response :not_found
    travel 6.minutes do
      get url
      assert_response :unauthorized
    end
  end

  test "raw disk transformation and legacy public PDF routes are retired" do
    ActiveStorage::Current.url_options = { host: "www.example.com" }
    get @blob.url
    assert_response :gone
    get "/rails/active_storage/representations/redirect/anything/anything/image.png"
    assert_response :gone
    %w[/uploads/private.pdf /safe/../uploads/private.pdf /documents/private.pdf /temp_uploads/private.pdf /pdf_file/secret /pdf_artifact/secret /download_pdf].each do |path|
      get path
      assert_response :gone
    end
    post "/rails/active_storage/direct_uploads", params: {}
    assert_response :gone
  end

  test "PDF byte range requests retain authorization and private caching" do
    login(@owner)
    get @url, headers: { "Range" => "bytes=0-3" }
    assert_response :partial_content
    assert_equal "%PDF", response.body
    assert_includes response.headers["Cache-Control"], "no-store"
  end

  test "upload reservations require owner verified bytes and cannot be replayed" do
    token, = native_session(@owner)
    headers = { "Authorization" => "Bearer #{token}" }
    body = "private contents"
    post "/api/v1/uploads", params: { upload: { filename: "notes.txt", byte_size: body.bytesize, checksum: Digest::MD5.base64digest(body), content_type: "text/plain" } }, headers:, as: :json
    assert_response :created
    signed = response.parsed_body.dig("data", "signed_blob_id")
    path = response.parsed_body.dig("data", "direct_upload", "url")
    Current.user, Current.workspace = @owner, @workspace
    assert_raises(ActiveRecord::RecordNotFound) { @owner.cover_photo.attach(signed) }
    Current.reset_all
    other_token, = native_session(@other)
    put path, params: body, headers: { "Authorization" => "Bearer #{other_token}", "Content-Type" => "text/plain" }
    assert_response :not_found
    put path, params: "x" * body.bytesize, headers: headers.merge("Content-Type" => "text/plain")
    assert_response :unprocessable_entity
    put path, params: body, headers: headers.merge("Content-Type" => "text/plain")
    assert_response :success
    put path, params: body, headers: headers.merge("Content-Type" => "text/plain")
    assert_response :not_found
    blob = ActiveStorage::Blob.find_signed!(signed)
    assert_equal body, blob.download
    Current.user, Current.workspace = @other, @workspace
    assert_raises(ActiveRecord::RecordNotFound) { @other.cover_photo.attach(signed) }
    Current.user = @owner
    @owner.cover_photo.attach(signed)
    assert @owner.cover_photo.attached?
  end

  test "signed IDs cannot launder another user's PDF into a new attachment" do
    Current.user, Current.workspace = @other, @workspace
    assert_raises(ActiveRecord::RecordNotFound) { @other.cover_photo.attach(@blob.signed_id) }
  end


  test "published portfolio media stays public and unpublishing revokes access" do
    previous = ENV["PORTFOLIO_ENABLED"]
    ENV["PORTFOLIO_ENABLED"] = "true"
    profile = PortfolioProfile.create!(full_name: "Portfolio", headline: "Engineer", summary: "Work", published: true)
    profile.resume.attach(@blob)
    url = rails_blob_path(profile.resume, only_path: true)
    get url
    assert_response :success
    profile.update!(published: false)
    get url
    assert_response :unauthorized
  ensure
    ENV["PORTFOLIO_ENABLED"] = previous
  end

  test "chat files require active conversation participation even within a workspace" do
    Current.user, Current.workspace = @owner, @workspace
    conversation = Conversation.create!(creator: @owner, conversation_type: "group", title: "Private chat")
    participant = conversation.conversation_participants.create!(user: @owner)
    message = conversation.messages.create!(user: @owner, body: "Private attachment")
    message.attachments.attach(io: StringIO.new("secret chat"), filename: "private.txt", content_type: "text/plain")
    url = rails_blob_path(message.attachments.first, only_path: true)
    login(@other)
    get url
    assert_response :not_found
    login(@owner)
    get url
    assert_response :success
    participant.update!(removed_at: Time.current)
    get url
    assert_response :not_found
  end

  test "expired artifacts and unattached blobs cannot be downloaded" do
    Current.user, Current.workspace = @owner, @workspace
    artifact = @owner.pdf_document_artifacts.create!(workspace: @workspace, kind: "text", expires_at: 1.minute.ago)
    artifact.file.attach(io: StringIO.new("expired"), filename: "expired.txt", content_type: "text/plain")
    artifact_url = rails_blob_path(artifact.file, only_path: true)
    unattached = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("orphan"), filename: "orphan.txt")
    login(@owner)
    get artifact_url
    assert_response :not_found
    get rails_blob_path(unattached, only_path: true)
    assert_response :not_found
  end

  private

  def login(user)
    post "/api/login", params: { auth: { email: user.email, password: "Password!42" } }, as: :json
    complete_test_mfa
    assert_response :success
  end

  def native_session(user)
    session, = MobileSession.issue_for!(user:)
    token = JwtService.encode({ user_id: user.id, mobile_session_id: session.id, type: "mobile_access" }, exp: 15.minutes.from_now)
    [token, session]
  end
end
