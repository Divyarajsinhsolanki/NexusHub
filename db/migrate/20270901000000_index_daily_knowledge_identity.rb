class IndexDailyKnowledgeIdentity < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def up
    execute <<~SQL
      CREATE UNIQUE INDEX CONCURRENTLY idx_daily_knowledge_workspace_date
      ON knowledge_prompt_runs (workspace_id, (metadata ->> 'daily_date'))
      WHERE source = 'bedrock_daily' AND metadata ->> 'daily_date' IS NOT NULL
    SQL
  end

  def down
    execute "DROP INDEX CONCURRENTLY IF EXISTS idx_daily_knowledge_workspace_date"
  end
end
