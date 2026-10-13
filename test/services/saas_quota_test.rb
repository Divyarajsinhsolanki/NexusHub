require "test_helper"

class SaasQuotaTest < ActiveSupport::TestCase
  setup do
    @workspace = Workspace.create!(name: "Quota", slug: "quota", kind: "private")
  end

  test "starter seat capacity blocks new members without deleting existing users" do
    5.times { |i| create_test_user(workspace: @workspace, email: "quota-#{i}@example.test") }
    assert_raises(ActiveRecord::RecordInvalid) { create_test_user(workspace: @workspace, email: "quota-full@example.test") }
    assert_equal 5, @workspace.users.count
  end

  test "starter project capacity permits edits and blocks only new projects" do
    8.times { |i| Project.create!(workspace: @workspace, name: "Project #{i}") }
    assert_raises(ActiveRecord::RecordInvalid) { Project.create!(workspace: @workspace, name: "Over capacity") }
    Project.unscoped.where(workspace: @workspace).first.update!(description: "Editable")
    assert_equal 8, Project.unscoped.where(workspace: @workspace).count
  end
end
