require 'test_helper'
require 'minitest/mock'

class AccountLifecycleTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: 'Account lifecycle', slug: 'account-lifecycle', kind: 'private')
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: 'account-life@example.test')
    @successor = create_test_user(workspace: @workspace, email: 'account-successor@example.test')
    post '/api/v1/auth/login', params: { auth: { email: @user.email, password: 'Password!42' } }
    @headers = { 'Authorization' => "Bearer #{response.parsed_body.dig('data', 'access_token')}", 'Accept' => 'application/json' }
  end

  test 'both clients share status and an authenticated personal export' do
    Current.workspace = @workspace
    @user.posts.create!(message: 'My private export')
    @successor.posts.create!(message: 'Not my data')
    ['/api/account', '/api/v1/account'].each do |path|
      get path, headers: @headers
      assert_response :success
      assert_equal 'none', response.parsed_body.dig('data', 'status')
    end
    get '/api/v1/account/export', headers: @headers
    assert_response :success
    assert_includes response.body, 'My private export'
    assert_not_includes response.body, 'Not my data'
    assert_not_includes response.body, 'encrypted_password'
    assert_equal 'no-store', response.headers['Cache-Control']
    get '/api/account/export'
    assert_response :unauthorized
  end

  test 'wrong codes are counted and expiry prevents scheduling' do
    send_code
    post '/api/v1/account/deletion', params: { verification_code: '999999', confirmation: 'DELETE' }, headers: @headers
    assert_response :unprocessable_entity
    assert_equal 1, AccountDeletionRequest.find_by!(user: @user).verification_attempts
    travel 16.minutes do
      post '/api/v1/auth/login', params: { auth: { email: @user.email, password: 'Password!42' } }
      @headers['Authorization'] = "Bearer #{response.parsed_body.dig('data', 'access_token')}"
      schedule
      assert_response :unprocessable_entity
    end
    assert_equal 'verification_pending', AccountDeletionRequest.find_by!(user: @user).status
  end

  test 'cancellation from the other client prevents a queued deletion' do
    send_code
    schedule
    assert_response :success
    request = AccountDeletionRequest.find_by!(user: @user)
    delete '/api/account/deletion', headers: @headers
    assert_response :success
    travel 8.days do
      AccountDeletionJob.perform_now(request.id)
      assert_nil @user.reload.deleted_at
    end
    assert_equal 'cancelled', request.reload.status
  end

  test 'ownership transfer is verified and cannot cross a workspace' do
    Current.workspace = @workspace
    project = Project.create!(name: 'Keep shared project', owner: @user)
    foreign_workspace = Workspace.create!(name: 'Other workspace', slug: 'account-other', kind: 'private')
    foreign_user = Current.set(workspace: foreign_workspace) { create_test_user(workspace: foreign_workspace, email: 'foreign-owner@example.test') }
    send_code
    schedule(successor_id: foreign_user.id)
    assert_response :unprocessable_entity
    assert_equal @user.id, project.reload.owner_id
    schedule(successor_id: @successor.id)
    assert_response :success
    assert_equal @successor.id, project.reload.owner_id
    assert ProjectUser.unscoped.exists?(project_id: project.id, user_id: @successor.id, status: 'active')
  end

  test 'completion removes personal data and sessions but preserves anonymous shared history' do
    Current.workspace = @workspace
    conversation = Conversation.create!(creator: @successor, conversation_type: 'group', title: 'Shared chat')
    conversation.conversation_participants.create!(user: @user)
    conversation.conversation_participants.create!(user: @successor)
    message = conversation.messages.create!(user: @user, body: 'Remove my message')
    @user.posts.create!(message: 'Remove my post')
    @user.update!(bio: 'Private biography', phone_number: '123456', social_links: { github: 'private-profile' })
    @user.profile_picture.attach(io: StringIO.new('avatar'), filename: 'avatar.txt', content_type: 'text/plain')
    operation = @user.pdf_document_operations.create!(kind: 'merge', status: 'queued', progress: 0)
    operation.source_files.attach(io: StringIO.new('private input'), filename: 'private-input.pdf', content_type: 'application/pdf')
    WebSession.issue_for!(@user)
    McpAccessToken.issue!(user: @user, name: 'Personal access')
    send_code
    schedule
    assert_response :success
    request = AccountDeletionRequest.find_by!(user: @user)
    travel 8.days do
      Current.reset_all
      AccountDeletionJob.perform_now(request.id)
    end
    assert_equal 'completed', request.reload.status
    assert @user.reload.deleted_at
    assert @user.locked?
    assert_equal 'Deleted User', @user.full_name
    assert_nil @user.bio
    assert_nil @user.phone_number
    assert_empty @user.social_links
    assert_not @user.profile_picture.attached?
    assert_equal 0, WebSession.where(user: @user).count
    assert_equal 0, MobileSession.where(user: @user).count
    assert_equal 0, McpAccessToken.where(user: @user).count
    assert_equal 0, Post.unscoped.where(user: @user).count
    assert_equal 0, PdfDocumentOperation.unscoped.where(user: @user).count
    assert_equal '', message.reload.body
    assert message.deleted_at
    assert Conversation.unscoped.exists?(conversation.id)
    assert_nil Current.workspace
    get '/api/v1/account', headers: @headers
    assert_response :unauthorized
  end

  test 'new ownership blocks finalization instead of abandoning shared resources' do
    send_code
    schedule
    request = AccountDeletionRequest.find_by!(user: @user)
    Current.workspace = @workspace
    Project.create!(name: 'New responsibility', owner: @user)
    travel 8.days do
      AccountDeletionJob.perform_now(request.id)
    end
    assert_equal 'blocked', request.reload.status
    assert_nil @user.reload.deleted_at
  end

  test 'five wrong codes exhaust verification and resends are throttled' do
    send_code
    post '/api/v1/account/deletion/code', headers: @headers
    assert_response :unprocessable_entity
    5.times do
      post '/api/v1/account/deletion', params: { verification_code: '999999', confirmation: 'DELETE' }, headers: @headers
      assert_response :unprocessable_entity
    end
    schedule
    assert_response :unprocessable_entity
    assert_equal 'verification_pending', AccountDeletionRequest.find_by!(user: @user).status
  end

  test 'direct chats do not require transfer and their private participants are preserved' do
    Current.workspace = @workspace
    conversation = Conversation.create!(creator: @user, conversation_type: 'direct')
    conversation.conversation_participants.create!(user: @user)
    conversation.conversation_participants.create!(user: @successor)
    send_code
    schedule
    assert_response :success
    assert_equal @user.id, conversation.reload.creator_id
    assert_equal 2, ConversationParticipant.unscoped.where(conversation_id: conversation.id).count
  end

  test 'group ownership cannot expose a private group to a new participant' do
    Current.workspace = @workspace
    conversation = Conversation.create!(creator: @user, conversation_type: 'group', title: 'Private group')
    conversation.conversation_participants.create!(user: @user)
    send_code
    schedule(successor_id: @successor.id)
    assert_response :unprocessable_entity
    assert_equal @user.id, conversation.reload.creator_id
    assert_not ConversationParticipant.unscoped.exists?(conversation_id: conversation.id, user_id: @successor.id)
  end

  test 'export includes expiring upload links and the mailer decrypts the verification code' do
    Current.workspace = @workspace
    @user.profile_picture.attach(io: StringIO.new('avatar'), filename: 'export-avatar.txt', content_type: 'text/plain')
    get '/api/account/export', headers: @headers
    assert_response :success
    upload = response.parsed_body.dig('data', 'uploads').first
    assert_equal 'export-avatar.txt', upload['filename']
    assert_match %r{/rails/active_storage/blobs/redirect/}, upload['download_url']
    key = Rails.application.key_generator.generate_key('account-deletion-code', 32)
    encrypted = ActiveSupport::MessageEncryptor.new(key).encrypt_and_sign('123456')
    email = AccountLifecycleMailer.verification(@user, encrypted)
    assert_includes email.body.encoded, '123456'
    assert_equal [@user.email], email.to
  end

  test 'the last site administrator cannot abandon administrative ownership' do
    Current.workspace = @workspace
    @user.update!(site_admin: true)
    send_code
    schedule(successor_id: @successor.id)
    assert_response :unprocessable_entity
    assert @user.reload.site_admin?
  end

  private

  def send_code
    SecureRandom.stub(:random_number, 123456) do
      post '/api/v1/account/deletion/code', headers: @headers
    end
    assert_response :success
  end

  def schedule(successor_id: nil)
    post '/api/v1/account/deletion', params: { verification_code: '123456', confirmation: 'DELETE', successor_id: successor_id }, headers: @headers
  end
end
