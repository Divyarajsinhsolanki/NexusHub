require 'test_helper'
require 'base64'

class GroupProfilesTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: 'Group profiles', slug: 'group-profiles', kind: 'private')
    Current.workspace = @workspace
    @creator = create_test_user(workspace: @workspace, email: 'group-creator@example.test')
    @member = create_test_user(workspace: @workspace, email: 'group-member@example.test')
    @outsider = create_test_user(workspace: @workspace, email: 'group-outsider@example.test')
    @group = Conversation.create!(workspace: @workspace, creator: @creator, conversation_type: 'group', title: 'Design')
    [@creator, @member].each { |user| @group.conversation_participants.create!(workspace: @workspace, user: user) }
  end

  test 'creator controls info editing without granting rename or settings permissions' do
    login(@member)
    patch "/api/conversations/#{@group.id}", params: { conversation: { description: 'Not allowed' } }
    assert_response :forbidden
    login(@creator)
    patch "/api/conversations/#{@group.id}", params: { conversation: { description: 'Design notes', members_can_edit_group_info: true } }
    assert_response :success
    assert_equal 'Design notes', response.parsed_body['description']
    login(@member)
    get "/api/conversations/#{@group.id}/summary"
    assert_equal true, response.parsed_body['can_edit_group_info']
    assert_equal false, response.parsed_body['can_edit_group']
    patch "/api/conversations/#{@group.id}", params: { conversation: { description: 'Member update' } }
    assert_response :success
    [:title, :members_can_edit_group_info].each do |field|
      patch "/api/conversations/#{@group.id}", params: { conversation: { field => (field == :title ? 'Renamed' : false) } }
      assert_response :forbidden
    end
    login(@creator)
    patch "/api/conversations/#{@group.id}", params: { conversation: { members_can_edit_group_info: false } }
    assert_response :success
    login(@member)
    patch "/api/conversations/#{@group.id}", params: { conversation: { description: 'Blocked again' } }
    assert_response :forbidden
  end

  test 'photo uploads serialize and remain private to active members' do
    login(@creator)
    upload_photo
    assert_response :success
    url = response.parsed_body.fetch('group_photo_url')
    login(@member)
    get url
    assert_response :success
    login(@outsider)
    get url
    assert_response :not_found
    login(@member)
    @group.conversation_participants.find_by!(user: @member).update!(removed_at: Time.current)
    get url
    assert_response :not_found
    login(@creator)
    patch "/api/conversations/#{@group.id}", params: { conversation: { remove_group_photo: true } }
    assert_response :success
    assert_nil response.parsed_body['group_photo_url']
  end

  test 'rejects invalid images, oversized descriptions, outsiders and direct chats' do
    login(@creator)
    upload_photo(type: 'text/plain')
    assert_response :unprocessable_entity
    refute @group.reload.group_photo.attached?
    patch "/api/conversations/#{@group.id}", params: { conversation: { description: 'x' * 2001, members_can_edit_group_info: true } }
    assert_response :unprocessable_entity
    refute @group.reload.members_can_edit_group_info?
    login(@outsider)
    patch "/api/conversations/#{@group.id}", params: { conversation: { description: 'Outside' } }
    assert_response :not_found
    login(@creator)
    @group.update!(conversation_type: 'direct')
    patch "/api/conversations/#{@group.id}", params: { conversation: { description: 'No group info' } }
    assert_response :forbidden
  end

  test 'native group members can update info when allowed' do
    @group.update!(members_can_edit_group_info: true)
    session, = MobileSession.issue_for!(user: @member)
    headers = { 'Authorization' => "Bearer #{MobileAccessToken.issue(session)[:token]}" }
    patch "/api/v1/conversations/#{@group.id}", params: { conversation: { description: 'From mobile' } }, headers: headers, as: :json
    assert_response :success
    assert_equal 'From mobile', response.parsed_body.dig('data', 'description')
  end

  test 'workspace admins in the group can manage info and permissions' do
    @member.roles << Role.find_by!(name: 'admin')
    login(@member)
    patch "/api/conversations/#{@group.id}", params: { conversation: { description: 'Admin update', members_can_edit_group_info: true } }
    assert_response :success
    assert_equal true, response.parsed_body['can_edit_group']
    assert_equal true, response.parsed_body['members_can_edit_group_info']
  end

  test 'failed photo replacement and failed removal keep the existing image' do
    login(@creator)
    upload_photo
    assert_response :success
    original_blob = @group.reload.group_photo.blob.id
    upload_photo(type: 'text/plain')
    assert_response :unprocessable_entity
    assert_equal original_blob, @group.reload.group_photo.blob.id
    patch "/api/conversations/#{@group.id}", params: { conversation: { remove_group_photo: true, description: 'x' * 2001 } }
    assert_response :unprocessable_entity
    assert_equal original_blob, @group.reload.group_photo.blob.id
  end

  private

  def login(user)
    post '/api/login', params: { auth: { email: user.email, password: 'Password!42' } }
    complete_test_mfa
    assert_response :success
  end

  def upload_photo(type: 'image/png')
    file = Tempfile.new(['group', '.png'])
    file.binmode
    file.write(type == 'image/png' ? Base64.decode64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=') : 'Not an image')
    file.flush
    upload = Rack::Test::UploadedFile.new(file.path, type)
    patch "/api/conversations/#{@group.id}", params: { conversation: { group_photo: upload } }
  ensure
    file&.close!
  end
end
