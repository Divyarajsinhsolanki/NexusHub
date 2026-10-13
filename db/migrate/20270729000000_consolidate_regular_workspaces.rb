class ConsolidateRegularWorkspaces < ActiveRecord::Migration[8.1]
  # Retain the version for migration history, but never merge tenants on a
  # fresh install or an environment where this migration has not run.
  # Applied copies cannot be undone without verified pre-merge ownership data.
  def up
    say "Workspace consolidation disabled: preserving company isolation"
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Previously consolidated ownership requires backup-based recovery"
  end
end
