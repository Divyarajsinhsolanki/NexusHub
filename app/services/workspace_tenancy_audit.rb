# Read-only inventory for recovering legacy tenant ownership. Counts and foreign
# keys can expose inconsistencies, but cannot establish a record's company owner.
class WorkspaceTenancyAudit
  CONSOLIDATION_VERSION = "20270729000000".freeze

  def self.call
    new.call
  end

  def initialize(connection: ApplicationRecord.connection)
    @connection = connection
  end

  def call
    tables = @connection.tables.select do |table|
      @connection.columns(table).any? { |column| column.name == "workspace_id" }
    end.sort
    inventory = tables.to_h { |table| [table, table_inventory(table)] }
    associations = tables.flat_map { |table| association_checks(table, tables) }
    {
      generated_at: Time.current.iso8601,
      consolidation_migration_recorded: @connection.select_value(
        "SELECT COUNT(*) FROM schema_migrations WHERE version = #{@connection.quote(CONSOLIDATION_VERSION)}"
      ).to_i.positive?,
      legacy_workspace_id: Workspace.find_by(slug: Workspace::REGULAR_SLUG)&.id,
      workspaces: Workspace.order(:id).pluck(:id, :name, :slug, :kind).map do |id, name, slug, kind|
        { id: id, name: name, slug: slug, kind: kind }
      end,
      tables: inventory,
      associations: associations,
      integrity_issues: inventory.values.sum { |entry| entry[:unassigned_rows] + entry[:orphaned_rows] } +
        associations.sum { |entry| entry[:cross_workspace_rows] },
      ownership_recovery_required: "Verify pre-merge backups and ownership evidence before moving legacy data. Migration history alone does not prove consolidation occurred.",
      coverage: "Workspace columns and database-declared foreign keys between tenant tables. Polymorphic references, undeclared associations, files, jobs and caches require separate review."
    }
  end

  private

  def table_inventory(table)
    rows = @connection.select_all(<<~SQL).to_a
      SELECT records.workspace_id, COUNT(*) AS row_count,
             COUNT(*) FILTER (WHERE records.workspace_id IS NULL) AS unassigned_rows,
             COUNT(*) FILTER (WHERE records.workspace_id IS NOT NULL AND tenants.id IS NULL) AS orphaned_rows
      FROM #{@connection.quote_table_name(table)} records
      LEFT JOIN workspaces tenants ON tenants.id = records.workspace_id
      GROUP BY records.workspace_id
      ORDER BY records.workspace_id
    SQL
    {
      total_rows: rows.sum { |row| row["row_count"].to_i },
      unassigned_rows: rows.sum { |row| row["unassigned_rows"].to_i },
      orphaned_rows: rows.sum { |row| row["orphaned_rows"].to_i },
      rows_by_workspace: rows.map { |row| { workspace_id: row["workspace_id"], count: row["row_count"].to_i } }
    }
  end

  def association_checks(table, tenant_tables)
    @connection.foreign_keys(table).filter_map do |foreign_key|
      next unless tenant_tables.include?(foreign_key.to_table)
      columns = Array(foreign_key.column)
      primary_keys = Array(foreign_key.primary_key)
      join = columns.zip(primary_keys).map do |column, primary_key|
        "source.#{@connection.quote_column_name(column)} = target.#{@connection.quote_column_name(primary_key)}"
      end.join(" AND ")

      count = @connection.select_value(<<~SQL).to_i
        SELECT COUNT(*)
        FROM #{@connection.quote_table_name(table)} source
        JOIN #{@connection.quote_table_name(foreign_key.to_table)} target
          ON #{join}
        WHERE source.workspace_id IS DISTINCT FROM target.workspace_id
      SQL
      if table == "support_access_grants" && foreign_key.column == "support_user_id"
        next { table: table, column: foreign_key.column, target_table: foreign_key.to_table,
          cross_workspace_rows: 0, approved_external_reference_rows: count }
      end
      { table: table, column: foreign_key.column, target_table: foreign_key.to_table, cross_workspace_rows: count }
    end
  end
end
