require "test_helper"
require Rails.root.join("db/migrate/20270729000000_consolidate_regular_workspaces")

class ConsolidateRegularWorkspacesTest < ActiveSupport::TestCase
  test "preserves independent workspaces records and owner roles" do
    regular = Workspace.regular!
    demo = Workspace.create!(name: "Demo", slug: "migration-demo", kind: "demo")
    source = Workspace.create!(name: "Personal", slug: "migration-personal", kind: "private")
    Project.create!(workspace: regular, name: "Shared project")
    source_project = Project.create!(workspace: source, name: "Shared project")
    source_user = source.users.create!(
      email: "migration-user@example.test",
      password: "Password!42",
      password_confirmation: "Password!42",
      first_name: "Migration",
      last_name: "User",
      job_title: "Engineer",
      status: "active",
      confirmed_at: Time.current
    )
    source_user.roles = [Role.find_by!(name: "owner")]

    ConsolidateRegularWorkspaces.new.migrate(:up)

    assert_equal source, source_user.reload.workspace
    assert source_user.owner?
    assert_equal source, source_project.reload.workspace
    assert_equal "Shared project", source_project.name
    assert Workspace.exists?(source.id)
    assert Workspace.exists?(demo.id)
  end
end
