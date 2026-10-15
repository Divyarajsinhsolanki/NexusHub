require "test_helper"
require "minitest/mock"

class WorkspaceOffboardingTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Offboard Company", slug: "offboarding-company", kind: "private", plan_key: "enterprise", billing_status: "active")
    @owner = create_test_user(workspace: @workspace, email: "offboarding-owner@example.test")
    @employee = create_test_user(workspace: @workspace, email: "offboarding-employee@example.test")
    Current.set(workspace: @workspace) { @owner.roles = [Role.find_by!(name: "owner")] }
    @project = Project.create!(workspace: @workspace, owner: @employee, name: "Employee project")
    Current.set(workspace: @workspace) { @employee.project_users.create!(project: @project, role: "owner") }
    post "/api/login", params: { auth: { email: @owner.email, password: "Password!42" } }
    complete_test_mfa
    assert_response :success
  end

  test "offboarding transfers ownership revokes every credential and retains records" do
    @employee.update!(keka_base_url: "https://company.keka.com", keka_employee_id: "EMP1", keka_api_key: "employee-secret")
    mobile, refresh = MobileSession.issue_for!(user: @employee)
    web = WebSession.issue_for!(@employee)
    _, raw = McpAccessToken.issue!(user: @employee, name: "Employee key")
    membership = @employee.membership_for
    get "/api/workspace_memberships/#{membership.id}/offboarding"
    assert_response :success
    assert response.parsed_body["needs_transfer"]
    assert_no_difference ["User.count", "Project.unscoped.count"] do
      post "/api/workspace_memberships/#{membership.id}/offboarding", params: { offboarding: { confirmation: "OFFBOARD", successor_id: @owner.id } }
    end
    assert_response :success
    assert @employee.reload.membership_for.suspended?
    assert_nil @employee.keka_secret_ciphertext
    assert_nil @employee.encrypted_keka_api_key
    assert_nil @employee.keka_api_key
    assert_empty @employee.keka_profile_data
    assert @employee.membership_for.offboarded_at
    assert_equal @owner.id, @project.reload.owner_id
    assert_equal "removed", ProjectUser.unscoped.find_by(user_id: @employee.id, project_id: @project.id).status
    assert mobile.reload.revoked_at
    assert web.reload.revoked_at
    assert_nil McpAccessToken.authenticate(raw)
    post "/api/v1/auth/refresh", params: { refresh_token: refresh }
    assert_response :unauthorized
    post "/api/workspace_memberships/#{membership.id}/offboarding", params: { offboarding: { confirmation: "OFFBOARD" } }
    assert_response :success
    assert_equal 1, WorkspaceAccessEvent.in_workspace(@workspace).where(action: "employee.offboarded", subject: @employee).count
  end

  test "media cleanup reports failures and can retry while chat history remains retained" do
    conversation = Conversation.create!(workspace: @workspace, creator: @owner, conversation_type: "direct")
    Current.set(workspace: @workspace) do
      [@owner, @employee].each { |user| conversation.conversation_participants.create!(workspace: @workspace, user: user) }
    end
    call = CallSession.create!(workspace: @workspace, conversation: conversation, initiator: @owner, call_type: "video", status: "active", livekit_room_name: "offboarding-test-room")
    call.call_participants.create!(workspace: @workspace, user: @employee, status: "joined")
    membership = @employee.membership_for
    post "/api/workspace_memberships/#{membership.id}/offboarding", params: { offboarding: { confirmation: "OFFBOARD", successor_id: @owner.id } }
    assert_response :success
    event = WorkspaceAccessEvent.in_workspace(@workspace).where(action: "employee.offboarded", subject: @employee).last
    assert_equal "pending", event.details["cleanup_status"]
    participant = ConversationParticipant.unscoped.find_by!(conversation: conversation, user: @employee)
    assert participant.removed_at
    assert Conversation.unscoped.exists?(conversation.id)
    Chat::LivekitRoomPresence.stub(:request, ->(*) { raise Chat::LivekitRoomPresence::Unavailable, "Offline" }) do
      assert_raises(Chat::LivekitRoomPresence::Unavailable) { WorkspaceOffboardingCleanupJob.new.perform(event.id) }
    end
    assert_equal "failed", event.reload.details["cleanup_status"]
    requests = []
    Chat::LivekitRoomPresence.stub(:request, ->(*args, **options) { requests << args; {} }) do
      WorkspaceOffboardingCleanupJob.new.perform(event.id)
    end
    assert_equal "completed", event.reload.details["cleanup_status"]
    assert_equal "RemoveParticipant", requests.first[1]
    assert_equal "workspace-#{@workspace.id}:user-#{@employee.id}", requests.first[2][:identity]
  end

  test "missing successor or incorrect confirmation leaves all access unchanged" do
    membership = @employee.membership_for
    [ { confirmation: "OFFBOARD" }, { confirmation: "wrong", successor_id: @owner.id } ].each do |attributes|
      post "/api/workspace_memberships/#{membership.id}/offboarding", params: { offboarding: attributes }
      assert_response :unprocessable_entity
      assert @employee.reload.workspace_access?
      assert_equal @employee.id, @project.reload.owner_id
    end
  end

  test "offboarded employees cannot be silently reactivated through the old membership editor" do
    membership = @employee.membership_for
    post "/api/workspace_memberships/#{membership.id}/offboarding", params: { offboarding: { confirmation: "OFFBOARD", successor_id: @owner.id } }
    assert_response :success
    patch "/api/workspace_memberships/#{membership.id}", params: { workspace_membership: { status: "active" } }
    assert_response :unprocessable_entity
    assert_not @employee.reload.workspace_access?
  end
end
