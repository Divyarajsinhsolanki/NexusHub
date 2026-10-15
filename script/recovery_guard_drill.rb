abort 'Disposable guard drill database required' unless ENV['DEPLOYMENT_TIER'] == 'restore' && ActiveRecord::Base.connection_db_config.database.match?(/_restore_drill[a-f0-9]+\z/)
Rails.application.load_tasks
require Rails.root.join('lib/recovery/toolkit')
tool = Recovery::Toolkit.new
values = tool.database_env('DATABASE_URL')
connection = tool.connect(values)
inventory = tool.inventory(connection)
connection.close
report_path = ENV.fetch('RESTORE_REPORT_PATH')
Dir.mktmpdir('recovery-guard-') do |directory|
  receipt_path = File.join(directory, 'guard.json')
  original_tier, original_receipt = ENV['DEPLOYMENT_TIER'], ENV['BACKUP_RECEIPT_PATH']
  Rails.env.define_singleton_method(:production?) { true }
  ENV['DEPLOYMENT_TIER'] = 'production'
  ENV['BACKUP_RECEIPT_PATH'] = receipt_path
  base = { 'kind' => 'backup', 'format' => 1, 'sha256' => 'a' * 64, 'started_at' => Time.now.utc.iso8601,
    'offsite_verified' => true, 'database_fingerprint' => tool.fingerprint(values), 'migration_versions' => inventory['migration_versions'] }
  blocked = lambda do |receipt|
    tool.atomic_json(receipt_path, receipt)
    task = Rake::Task['recovery:migration_preflight']; task.reenable
    stopped = false
    begin
      task.invoke
    rescue SystemExit
      stopped = true
    end
    abort 'Unsafe migration preflight was allowed.' unless stopped
  end
  blocked.call(base.merge('offsite_verified' => false))
  blocked.call(base.merge('started_at' => 2.hours.ago.utc.iso8601))
  blocked.call(base.merge('database_fingerprint' => 'other-database'))
  blocked.call(base.merge('migration_versions' => ['wrong-version']))
  tool.atomic_json(receipt_path, base)
  task = Rake::Task['recovery:migration_preflight']; task.reenable; task.invoke
  report = JSON.parse(File.read(report_path))
  report['migration_backup_guard_verified'] = true
  tool.atomic_json(report_path, report)
ensure
  Rails.env.singleton_class.remove_method(:production?)
  ENV['DEPLOYMENT_TIER'], ENV['BACKUP_RECEIPT_PATH'] = original_tier, original_receipt
end
puts 'Migration backup preflight guard cases verified.'
