require "test_helper"

class WorkspaceInvitationsTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper
  setup do
    clear_enqueued_jobs
    @workspace = Workspace.create!(name: "Invite Company", slug: "invite-company", kind: "private", plan_key: "enterprise", billing_status: "active")
    @owner = create_test_user(workspace: @workspace, email: "invite-owner@example.test")
    Current.set(workspace: @workspace) { @owner.roles = [Role.find_by!(name: "owner")] }
    login(@owner)
  end

  test "invitation creates no account, sends an encrypted single-use company link, and assigns approved roles" do
    project = Project.create!(workspace: @workspace, owner: @owner, name: "Invite project")
    assert_no_difference "User.count" do
      post "/api/workspace_invitations", params: { workspace_invitation: { email: "  Teammate@Example.test ", role_names: ["project_manager"], project_ids: [project.id] } }
    end
    assert_response :created
    assert_not response.body.include?("token_digest")
    invitation, token, encrypted = latest_invitation
    assert_equal "teammate@example.test", invitation.email
    assert_not encrypted.include?(token)
    assert_not_equal token, invitation.token_digest
    WorkspaceInvitationMailJob.perform_now(invitation.id, encrypted)
    message = ActionMailer::Base.deliveries.last.text_part.body.decoded
    assert_includes message, "/invitations/accept#token=#{token}"
    assert_not_includes message, "?token="
    assert_equal "sent", invitation.reload.delivery_status
    delete "/api/logout"
    post "/api/workspace_invitations/preview", params: { invitation_token: token }
    assert_response :success
    assert_equal "Invite Company", response.parsed_body["workspace_name"]
    assert_equal "no-store", response.headers["Cache-Control"]
    post "/api/workspace_invitations/accept", params: accept_params(token).merge(workspace_id: Workspace.regular!.id, role_names: ["owner"])
    assert_response :success
    accepted = User.find_by!(email: invitation.email)
    assert_equal @workspace.id, accepted.workspace_id
    assert accepted.confirmed?
    assert_equal ["project_manager"], accepted.role_names
    assert ProjectUser.unscoped.exists?(project_id: project.id, user_id: accepted.id, status: "active")
    post "/api/workspace_invitations/accept", params: accept_params(token)
    assert_response :unprocessable_entity
    assert_equal "accepted", invitation.reload.status
  end

  test "resend rotates the token and revocation or expiration prevents acceptance" do
    invitation, old, = issue
    travel 61.seconds do
      post "/api/workspace_invitations/#{invitation.id}/resend"
      assert_response :success
    end
    _, fresh, = latest_invitation
    assert_not_equal old, fresh
    delete "/api/logout"
    post "/api/workspace_invitations/accept", params: accept_params(old)
    assert_response :unprocessable_entity
    login(@owner)
    post "/api/workspace_invitations/#{invitation.id}/revoke"
    assert_response :success
    delete "/api/logout"
    post "/api/workspace_invitations/accept", params: accept_params(fresh)
    assert_response :unprocessable_entity
    login(@owner)
    expiring, raw, = issue(email: "expires@example.test")
    delete "/api/logout"
    travel_to(expiring.expires_at + 1.second) do
      post "/api/workspace_invitations/accept", params: accept_params(raw)
      assert_response :unprocessable_entity
    end
  end

  test "admin cannot invite owner or manage a foreign invitation and members cannot invite" do
    admin = create_test_user(workspace: @workspace, email: "invite-admin@example.test")
    Current.set(workspace: @workspace) { admin.roles = [Role.find_by!(name: "admin")] }
    invitation, = issue
    login(admin)
    post "/api/workspace_invitations", params: { workspace_invitation: { email: "escalation@example.test", role_names: ["owner"] } }
    assert_response :unprocessable_entity
    other = Workspace.create!(name: "Other", slug: "invite-other", kind: "private")
    member = create_test_user(workspace: other, email: "invite-other-member@example.test")
    login(member)
    post "/api/workspace_invitations/#{invitation.id}/revoke"
    assert_response :forbidden
    get "/api/workspace_invitations"
    assert_response :forbidden
    post "/api/workspace_invitations", params: { workspace_invitation: { email: "bad@example.test" } }
    assert_response :forbidden
  end

  test "invalid acceptance rolls back token consumption and duplicate pending invitations are rejected" do
    invitation, token, = issue
    assert_no_difference "WorkspaceInvitation.unscoped.count" do
      post "/api/workspace_invitations", params: { workspace_invitation: { email: invitation.email } }
    end
    assert_response :unprocessable_entity
    delete "/api/logout"
    assert_no_difference "User.count" do
      post "/api/workspace_invitations/accept", params: { invitation_token: token, account: { first_name: "Bad", password: "short" } }
    end
    assert_response :unprocessable_entity
    assert invitation.reload.pending?
    post "/api/workspace_invitations/accept", params: accept_params(token)
    assert_response :success
  end

  test "pending invitations reserve seats and consuming a reserved seat is atomic" do
    @workspace.update!(seat_limit_override: 2)
    invitation, token, = issue
    post "/api/workspace_invitations", params: { workspace_invitation: { email: "over-capacity@example.test" } }
    assert_response :unprocessable_entity
    delete "/api/logout"
    post "/api/workspace_invitations/accept", params: accept_params(token)
    assert_response :success
    assert_equal 2, WorkspaceSeats.used(@workspace)
    assert_equal 0, WorkspaceSeats.reserved(@workspace)
  end

  test "an invitation never migrates an existing account from another company" do
    other = Workspace.create!(name: "Other", slug: "invite-existing-other", kind: "private")
    existing = create_test_user(workspace: other, email: "other-existing@example.test")
    invitation, token, = issue(email: existing.email)
    delete "/api/logout"
    post "/api/workspace_invitations/accept", params: accept_params(token).deep_merge(account: { current_password: "Password!42" })
    assert_response :unprocessable_entity
    assert_equal other.id, existing.reload.workspace_id
    assert invitation.reload.pending?
  end

  test "native invitation acceptance supports unauthenticated Origin null without cookie fallback" do
    invitation, raw, = issue
    delete "/api/logout"
    previous = ActionController::Base.allow_forgery_protection
    begin
      ActionController::Base.allow_forgery_protection = true
      post "/api/v1/workspace_invitations/accept", params: accept_params(raw), headers: { "Origin" => "null" }
      assert_response :success
      assert response.parsed_body.dig("data", "accepted")
    ensure
      ActionController::Base.allow_forgery_protection = previous
    end
  end

  test "legacy employee password provisioning is rejected" do
    assert_no_difference "User.count" do
      post "/api/users", params: { user: { email: "legacy-user@example.test", password: "OwnerChosen!42" } }
    end
    assert_response :gone
  end

  test "rehiring requires account proof and does not restore prior project access" do
    employee = create_test_user(workspace: @workspace, email: "returning@example.test")
    project = Project.create!(workspace: @workspace, owner: @owner, name: "Old private project")
    Current.set(workspace: @workspace) { employee.project_users.create!(project: project, role: "collaborator") }
    old_session = WebSession.issue_for!(employee)
    post "/api/workspace_memberships/#{employee.membership_for.id}/offboarding", params: { offboarding: { confirmation: "OFFBOARD" } }
    assert_response :success
    invitation, raw, = issue(email: employee.email)
    delete "/api/logout"
    post "/api/workspace_invitations/accept", params: accept_params(raw).deep_merge(account: { current_password: "WrongPassword" })
    assert_response :unprocessable_entity
    assert invitation.reload.pending?
    post "/api/workspace_invitations/accept", params: accept_params(raw).deep_merge(account: { current_password: "Password!42" })
    assert_response :success
    assert employee.reload.workspace_access?
    assert_nil employee.membership_for.offboarded_at
    assert_equal "removed", ProjectUser.unscoped.find_by!(project: project, user: employee).status
    assert old_session.reload.revoked_at
  end

  test "expired invitations can be renewed and stale mail jobs cannot send old links" do
    invitation, old, encrypted = issue
    travel_to(invitation.expires_at + 1.second) do
      login(@owner)
      invitation.update!(status: "expired")
      post "/api/workspace_invitations/#{invitation.id}/resend"
      assert_response :success
      _, fresh, new_encrypted = latest_invitation
      assert_not_equal old, fresh
      assert_no_difference "ActionMailer::Base.deliveries.size" do
        WorkspaceInvitationMailJob.perform_now(invitation.id, encrypted)
      end
      assert_difference "ActionMailer::Base.deliveries.size", 1 do
        WorkspaceInvitationMailJob.perform_now(invitation.id, new_encrypted)
      end
    end
  end

  test "foreign projects and foreign owner invitation management are rejected" do
    other = Workspace.create!(name: "Foreign", slug: "foreign-invite-company", kind: "private")
    foreign_owner = create_test_user(workspace: other, email: "foreign-invite-owner@example.test")
    Current.set(workspace: other) { foreign_owner.roles = [Role.find_by!(name: "owner")] }
    project = Project.create!(workspace: other, owner: foreign_owner, name: "Foreign private project")
    post "/api/workspace_invitations", params: { workspace_invitation: { email: "foreign-project@example.test", project_ids: [project.id] } }
    assert_response :unprocessable_entity
    invitation, = issue
    login(foreign_owner)
    post "/api/workspace_invitations/#{invitation.id}/revoke"
    assert_response :not_found
    assert invitation.reload.pending?
  end

  test "acceptance revalidates the sender's authority" do
    invitation, raw, = issue
    Current.set(workspace: @workspace) { @owner.roles = [Role.find_by!(name: "member")] }
    delete "/api/logout"
    post "/api/workspace_invitations/accept", params: accept_params(raw)
    assert_response :unprocessable_entity
    assert invitation.reload.pending?
  end

  private

  def login(user)
    post "/api/login", params: { auth: { email: user.email, password: "Password!42" } }
    complete_test_mfa
    assert_response :success
  end

  def issue(email: "teammate@example.test")
    post "/api/workspace_invitations", params: { workspace_invitation: { email: email, role_names: ["member"] } }
    assert_response :created
    latest_invitation
  end

  def latest_invitation
    invitation = WorkspaceInvitation.unscoped.order(:id).last
    job = enqueued_jobs.reverse.find { |item| item[:job] == WorkspaceInvitationMailJob }
    encrypted = job[:args][1]
    [invitation, WorkspaceInvitation.decrypt_token(encrypted), encrypted]
  end

  def accept_params(raw)
    { invitation_token: raw, account: { first_name: "New", last_name: "Teammate", job_title: "Engineer", password: "ChosenPass!42", password_confirmation: "ChosenPass!42" } }
  end
end
