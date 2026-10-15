require_relative '../recovery/toolkit'

namespace :recovery do
  desc 'Take the release backup, or recognize explicit first-time empty database setup'
  task prepare_release_backup: :environment do
    tool = Recovery::Toolkit.new
    connection = tool.connect(tool.database_env)
    begin
      empty = tool.inventory(connection)['table_counts'].empty?
      if empty && ENV['INITIAL_DATABASE_NAME'] == connection.db
        puts 'Explicit empty initial database; first offsite backup must run after bootstrap.'
      else
        Rake::Task['recovery:backup'].invoke
      end
    ensure
      connection.close
    end
  end

  desc 'Encrypt a consistent database snapshot and all referenced private upload bytes, then verify offsite storage'
  task backup: :environment do
    downloader = lambda do |blob, path|
      service = ActiveStorage::Blob.services.fetch(blob.fetch('service_name'))
      File.open(path, 'wb', 0600) { |file| service.download(blob.fetch('key')) { |chunk| file.write(chunk) } }
    end
    Recovery::Toolkit.new(ENV, blob_downloader: downloader).backup
  rescue StandardError => error
    abort(error.is_a?(Recovery::Error) ? error.message : "Backup failed (#{error.class}); no credentials or object content printed.")
  end

  desc 'Block production schema changes without a fresh offsite-verified backup of this database'
  task migration_preflight: :environment do
    next unless Rails.env.production?
    tier = ENV.fetch('DEPLOYMENT_TIER', 'production')
    next if tier == 'staging' # Synthetic staging has its own isolated resources.
    if tier == 'restore'
      abort 'Restore migrations require MIGRATION_REHEARSAL=true.' unless ENV['MIGRATION_REHEARSAL'] == 'true'
      next
    end
    tool = Recovery::Toolkit.new
    values = tool.database_env('DATABASE_URL')
    begin
      connection = tool.connect(values)
      current = tool.inventory(connection)
      if current['table_counts'].empty? && ENV['INITIAL_DATABASE_NAME'] == values['PGDATABASE']
        puts 'Explicit initial setup of an empty database; no recovery point exists yet.'
        next
      end
      receipt = tool.check(ENV.fetch('BACKUP_RECEIPT_PATH'), maximum_age: 3600, values: values)
      abort 'Backup schema differs from the live pre-migration schema; take a fresh backup.' unless receipt['migration_versions'] == current['migration_versions']
      puts 'Migration recovery point verified.'
    ensure
      connection&.close
    end
  rescue StandardError => error
    abort(error.is_a?(Recovery::Error) ? error.message : "Migration preflight failed (#{error.class}); inspect configuration without printing credentials.")
  end

  desc 'Read-only application checks on a restored database: tenancy, decryption and every private upload'
  task verify: :environment do
    abort 'Use a disposable restore database with DEPLOYMENT_TIER=restore.' unless ENV['DEPLOYMENT_TIER'] == 'restore' && ActiveRecord::Base.connection_db_config.database.match?(/_restore_[a-z0-9]+\z/)
    report_path = ENV.fetch('RESTORE_REPORT_PATH')
    report = JSON.parse(File.read(report_path))
    abort 'A successful matching restore report is required.' unless report['verified'] && report['destination_database'] == ActiveRecord::Base.connection_db_config.database
    report.merge!('application_checks_verified' => false, 'application_check_started_at' => Time.now.utc.iso8601)
    Recovery::Toolkit.new.atomic_json(report_path, report)
    counts = { encrypted_records: 0, uploads: 0 }
    [Item, ProjectVaultItem].each do |model|
      model.unscoped.find_each { |record| record.content; counts[:encrypted_records] += 1 }
    end
    WorkspaceIntegration.unscoped.where(revoked_at: nil).where.not(secret_ciphertext: nil).find_each { |record| record.secret; counts[:encrypted_records] += 1 }
    User.unscoped.where.not(keka_secret_ciphertext: nil).find_each { |record| record.keka_api_key; counts[:encrypted_records] += 1 }
    PrivacyRequest.where.not(payload_ciphertext: nil).find_each { |record| record.payload; counts[:encrypted_records] += 1 }
    ProjectOperationItem.unscoped.where.not(encrypted_license_key: [nil, '']).find_each do |record|
      Operations::Encryption.read(record, :license_key)
      counts[:encrypted_records] += 1
    end
    ProjectOperationEntry.unscoped.where.not(encrypted_value: [nil, '']).find_each do |record|
      Operations::Encryption.read(record, :value)
      counts[:encrypted_records] += 1
    end
    User.unscoped.find_each do |user|
      next if user.deleted_at
      abort 'User/workspace membership mismatch.' unless WorkspaceMembership.unscoped.where(user_id: user.id, workspace_id: user.workspace_id).exists?
    end
    ActiveStorage::Blob.unscoped.find_each do |blob|
      abort 'Restore media points at an external source.' unless blob.service_name == 'local'
      blob.open { |file| abort 'Upload size mismatch.' unless File.size(file.path) == blob.byte_size }
      counts[:uploads] += 1
    end
    abort 'Tenant foreign-key audit failed.' unless WorkspaceTenancyAudit.call[:integrity_issues].zero?
    pending = ActiveRecord::MigrationContext.new(Rails.root.join('db/migrate').to_s).needs_migration?
    report.merge!('application_checks_verified' => true, 'application_checked_at' => Time.now.utc.iso8601, 'application_counts' => counts, 'pending_migrations' => pending)
    Recovery::Toolkit.new.atomic_json(report_path, report)
    puts JSON.generate(report.slice('application_checks_verified', 'application_counts', 'pending_migrations'))
  rescue StandardError => error
    abort "Application recovery verification failed (#{error.class}); preserve the report and restore destination for investigation."
  end
end

# Protect the normal direct migration path as well as the application release.
Rake::Task['db:migrate'].enhance(['recovery:migration_preflight'])
task 'recovery:rollback_preflight' => :environment do
  abort 'Production rollback is unsafe by default; use a reviewed forward fix or a fresh restore target.' if Rails.env.production? && ENV.fetch('DEPLOYMENT_TIER', 'production') == 'production'
end
%w[db:rollback db:migrate:down].each { |name| Rake::Task[name].enhance(['recovery:rollback_preflight']) }
