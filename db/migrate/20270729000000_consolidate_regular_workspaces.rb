class ConsolidateRegularWorkspaces < ActiveRecord::Migration[8.1]
  REGULAR_SLUG = "private-workspace"
  UNIQUE_WORKSPACE_COLUMNS = {
    "departments" => "name",
    "issues" => "issue_key",
    "projects" => "name",
    "skills" => "name",
    "teams" => "name",
    "topics" => "name",
    "work_categories" => "name",
    "work_priorities" => "name",
    "work_tags" => "name"
  }.freeze

  def up
    ensure_membership_roles!
    regular_workspace_id = ensure_regular_workspace!

    source_workspaces(regular_workspace_id).each do |workspace|
      source_id = workspace.fetch("id").to_i

      downgrade_personal_workspace_owners!(source_id)
      rename_conflicting_records!(source_id, regular_workspace_id)
      move_workspace_records!(source_id, regular_workspace_id)
      execute("DELETE FROM workspaces WHERE id = #{source_id}")
    end
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Consolidated workspace ownership cannot be reconstructed"
  end

  private

  def ensure_membership_roles!
    now = connection.quote(Time.current)

    %w[member owner].each do |name|
      execute <<~SQL.squish
        INSERT INTO roles (name, created_at, updated_at)
        VALUES (#{connection.quote(name)}, #{now}, #{now})
        ON CONFLICT (name) DO NOTHING
      SQL
    end
  end

  def ensure_regular_workspace!
    workspace_id = select_value(
      "SELECT id FROM workspaces WHERE slug = #{connection.quote(REGULAR_SLUG)} LIMIT 1"
    )

    unless workspace_id
      now = connection.quote(Time.current)
      execute <<~SQL.squish
        INSERT INTO workspaces
          (name, slug, kind, plan_key, billing_status, module_overrides, created_at, updated_at)
        VALUES
          ('Nexus Hub Workspace', '#{REGULAR_SLUG}', 'private', 'enterprise', 'active', '{}', #{now}, #{now})
      SQL
      workspace_id = select_value(
        "SELECT id FROM workspaces WHERE slug = #{connection.quote(REGULAR_SLUG)} LIMIT 1"
      )
    end

    execute <<~SQL.squish
      UPDATE workspaces
      SET name = 'Nexus Hub Workspace',
          kind = 'private',
          plan_key = 'enterprise',
          billing_status = 'active',
          trial_ends_at = NULL,
          updated_at = #{connection.quote(Time.current)}
      WHERE id = #{workspace_id.to_i}
    SQL

    workspace_id.to_i
  end

  def source_workspaces(regular_workspace_id)
    select_all(<<~SQL.squish).to_a
      SELECT id, slug
      FROM workspaces
      WHERE kind <> 'demo' AND id <> #{regular_workspace_id}
      ORDER BY id
    SQL
  end

  def downgrade_personal_workspace_owners!(workspace_id)
    member_role_id = select_value("SELECT id FROM roles WHERE name = 'member'").to_i
    owner_role_id = select_value("SELECT id FROM roles WHERE name = 'owner'").to_i
    now = connection.quote(Time.current)

    execute <<~SQL.squish
      INSERT INTO user_roles (user_id, role_id, workspace_id, created_at, updated_at)
      SELECT users.id, #{member_role_id}, #{workspace_id}, #{now}, #{now}
      FROM users
      WHERE users.workspace_id = #{workspace_id} AND users.site_admin = FALSE
      ON CONFLICT (user_id, role_id) DO NOTHING
    SQL

    execute <<~SQL.squish
      DELETE FROM user_roles
      USING users
      WHERE user_roles.user_id = users.id
        AND user_roles.role_id = #{owner_role_id}
        AND users.workspace_id = #{workspace_id}
        AND users.site_admin = FALSE
    SQL
  end

  def rename_conflicting_records!(source_id, regular_workspace_id)
    UNIQUE_WORKSPACE_COLUMNS.each do |table, column|
      next unless table_exists?(table) && column_exists?(table, column)

      quoted_table = connection.quote_table_name(table)
      quoted_column = connection.quote_column_name(column)
      suffix = connection.quote(" (workspace #{source_id})")

      execute <<~SQL.squish
        UPDATE #{quoted_table} AS source
        SET #{quoted_column} = LEFT(source.#{quoted_column}, 220) || #{suffix}
        WHERE source.workspace_id = #{source_id}
          AND EXISTS (
            SELECT 1
            FROM #{quoted_table} AS target
            WHERE target.workspace_id = #{regular_workspace_id}
              AND target.#{quoted_column} = source.#{quoted_column}
          )
      SQL
    end
  end

  def move_workspace_records!(source_id, regular_workspace_id)
    workspace_scoped_tables.each do |table|
      execute <<~SQL.squish
        UPDATE #{connection.quote_table_name(table)}
        SET workspace_id = #{regular_workspace_id}
        WHERE workspace_id = #{source_id}
      SQL
    end
  end

  def workspace_scoped_tables
    @workspace_scoped_tables ||= connection.tables.select do |table|
      column_exists?(table, :workspace_id)
    end
  end
end
