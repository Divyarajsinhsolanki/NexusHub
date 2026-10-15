require "test_helper"
require Rails.root.join("db/migrate/20270902000000_create_workspace_memberships")

class CreateWorkspaceMembershipsTest < ActiveSupport::TestCase
  test "backfill preserves company boundaries statuses roles and records" do
    first = Workspace.create!(name: "First", slug: "membership-migration-first", kind: "private")
    second = Workspace.create!(name: "Second", slug: "membership-migration-second", kind: "private")
    owner = create_test_user(workspace: first, email: "membership-migration-owner@example.test")
    locked = create_test_user(workspace: second, email: "membership-migration-locked@example.test")
    Current.set(workspace: first) { owner.roles = [Role.find_by!(name: "owner")] }
    locked.update!(status: "locked")
    project = Project.create!(workspace: first, owner: owner, name: "Original project")
    before_roles = UserRole.unscoped.order(:id).pluck(:id, :user_id, :workspace_id, :role_id)
    before_users = User.order(:id).pluck(:id, :workspace_id, :status)
    connection = ApplicationRecord.connection
    original_path = connection.schema_search_path
    schema = "membership_rehearsal_#{SecureRandom.hex(6)}"
    quoted = connection.quote_table_name(schema)
    connection.execute("CREATE SCHEMA #{quoted}")
    %w[workspaces users roles user_roles].each do |table|
      connection.execute("CREATE TABLE #{quoted}.#{table} (LIKE public.#{table} INCLUDING DEFAULTS)")
      connection.execute("INSERT INTO #{quoted}.#{table} SELECT * FROM public.#{table}")
      connection.execute("ALTER TABLE #{quoted}.#{table} ADD PRIMARY KEY (id)")
    end
    connection.schema_search_path = "#{schema},public"
    connection.schema_cache.clear!
    migration = CreateWorkspaceMemberships.new
    migration.migrate(:up)
    assert_equal before_users, connection.select_rows("SELECT id, workspace_id, status FROM users ORDER BY id")
    assert_equal before_roles, connection.select_rows("SELECT id, user_id, workspace_id, role_id FROM user_roles ORDER BY id")
    assert_equal before_users.size, connection.select_value("SELECT COUNT(*) FROM workspace_memberships").to_i
    assert_equal first.id, connection.select_value("SELECT workspace_id FROM workspace_memberships WHERE user_id = #{owner.id}").to_i
    assert_equal second.id, connection.select_value("SELECT workspace_id FROM workspace_memberships WHERE user_id = #{locked.id}").to_i
    migration.migrate(:down)
    assert_equal before_roles, connection.select_rows("SELECT id, user_id, workspace_id, role_id FROM user_roles ORDER BY id")
    connection.schema_search_path = original_path
    connection.schema_cache.clear!
    connection.clear_cache!
    assert_equal first.id, project.reload.workspace_id
  ensure
    if connection
      connection.schema_search_path = original_path if original_path
      connection.execute("DROP SCHEMA IF EXISTS #{quoted} CASCADE") if quoted
      connection.schema_cache.clear!
      connection.clear_cache!
    end
  end
end
