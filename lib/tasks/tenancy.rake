namespace :tenancy do
  desc "Read-only JSON inventory of workspace ownership and cross-tenant foreign keys"
  task audit: :environment do
    ApplicationRecord.transaction(isolation: :repeatable_read) do
      ApplicationRecord.connection.execute("SET TRANSACTION READ ONLY")
      puts JSON.pretty_generate(WorkspaceTenancyAudit.call)
    end
  end
end
