require "test_helper"

class WorkspaceTenancyAuditTest < ActiveSupport::TestCase
  test "inventories all tenant tables without relying on the current workspace or changing records" do
    first = Workspace.create!(name: "First", slug: "audit-first", kind: "private")
    second = Workspace.create!(name: "Second", slug: "audit-second", kind: "private")
    Project.create!(workspace: first, name: "First project")
    Project.create!(workspace: second, name: "Second project")
    Current.workspace = first

    assert_no_difference ["Workspace.count", "User.count", "Project.unscoped.count"] do
      report = WorkspaceTenancyAudit.call
      counts = report.dig(:tables, "projects", :rows_by_workspace).to_h { |row| [row[:workspace_id], row[:count]] }
      assert_equal 1, counts[first.id]
      assert_equal 1, counts[second.id]
      assert_equal 0, report[:integrity_issues]
      assert report[:tables].key?("users")
      assert report[:tables].key?("user_roles")
    end
    assert_equal first, Current.workspace
  end

  test "detects cross-company foreign keys in legacy data and leaves them untouched" do
    first = Workspace.create!(name: "First", slug: "audit-mixed-first", kind: "private")
    second = Workspace.create!(name: "Second", slug: "audit-mixed-second", kind: "private")
    owner = create_test_user(workspace: first, email: "audit-owner@example.test")
    project = Project.create!(workspace: first, owner: owner, name: "Mixed ownership")
    # Reproduce legacy/imported corruption that bypassed model validation.
    project.update_columns(workspace_id: second.id)

    report = WorkspaceTenancyAudit.call
    association = report[:associations].find { |check| check[:table] == "projects" && check[:column] == "owner_id" }
    assert_equal 1, association[:cross_workspace_rows]
    assert_operator report[:integrity_issues], :>=, 1
    assert_equal second.id, project.reload.workspace_id
    assert_equal first.id, owner.reload.workspace_id
    assert_includes report[:ownership_recovery_required], "before moving legacy data"
  end
end
