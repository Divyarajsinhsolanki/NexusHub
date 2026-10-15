require "test_helper"

class WorkspaceContextProbeChannel < ApplicationCable::Channel
  attr_reader :visible_project_ids, :action_workspace

  def subscribed
    @visible_project_ids = Project.pluck(:id)
    stream_from "workspace_#{current_workspace.id}:probe"
  end

  def probe
    @action_workspace = Current.workspace
  end
end

class WorkspaceContextTest < ActionCable::Channel::TestCase
  tests WorkspaceContextProbeChannel

  setup do
    @workspace = Workspace.create!(name: "Channel", slug: "channel-membership-context", kind: "private")
    @other = Workspace.create!(name: "Other", slug: "channel-membership-other", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "channel-member@example.test")
    @project = Project.create!(workspace: @workspace, name: "Channel project")
    Project.create!(workspace: @other, name: "Other project")
    stub_connection current_user: @user, current_workspace: @workspace
  end

  test "subscriptions and actions receive tenant context and restore the calling context" do
    Current.workspace = @other
    subscribe
    assert_equal [@project.id], subscription.visible_project_ids
    assert_equal @other, Current.workspace
    perform :probe
    assert_equal @workspace, subscription.action_workspace
    assert_equal @other, Current.workspace
  end

  test "inactive membership rejects subscription and action callbacks" do
    @user.membership_for.update!(status: "suspended")
    subscribe
    assert subscription.rejected?
    assert_nil subscription.visible_project_ids
  end
end
