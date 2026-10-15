require 'tmpdir'
abort 'Disposable migration drill database required' unless ENV['DEPLOYMENT_TIER'] == 'restore' && ActiveRecord::Base.connection_db_config.database.match?(/_restore_drill[a-f0-9]+\z/)
connection = ActiveRecord::Base.connection
versions = %w[20300101000100 20300101000200]
Dir.mktmpdir('migration-rehearsal-') do |directory|
  File.write(File.join(directory, "#{versions[0]}_recovery_drill_first.rb"), <<~RUBY)
    class RecoveryDrillFirst < ActiveRecord::Migration[7.1]
      def change
        create_table(:recovery_drill_first) { |table| table.string :marker }
      end
    end
  RUBY
  second = File.join(directory, "#{versions[1]}_recovery_drill_second.rb")
  File.write(second, <<~RUBY)
    class RecoveryDrillSecond < ActiveRecord::Migration[7.1]
      def change
        create_table(:recovery_drill_second) { |table| table.string :marker }
        raise 'Intentional synthetic migration failure'
      end
    end
  RUBY
  failed = false
  begin
    ActiveRecord::MigrationContext.new(directory).migrate
  rescue StandardError => error
    failed = error.message.include?('Intentional synthetic migration failure')
  end
  applied = connection.select_values('SELECT version FROM schema_migrations')
  abort 'Migration failure boundary was not preserved.' unless failed && connection.table_exists?(:recovery_drill_first) && !connection.table_exists?(:recovery_drill_second) && applied.include?(versions[0]) && !applied.include?(versions[1])
  File.write(second, <<~RUBY)
    class RecoveryDrillSecond < ActiveRecord::Migration[7.1]
      def change
        create_table(:recovery_drill_second) { |table| table.string :marker }
      end
    end
  RUBY
  ActiveRecord::MigrationContext.new(directory).migrate
  abort 'Forward migration recovery failed.' unless connection.table_exists?(:recovery_drill_second) && connection.select_values('SELECT version FROM schema_migrations').include?(versions[1])
  path = ENV.fetch('RESTORE_REPORT_PATH')
  report = JSON.parse(File.read(path))
  report.merge!('migration_failure_boundary_verified' => true, 'forward_migration_recovery_verified' => true)
  Recovery::Toolkit.new.atomic_json(path, report)
end
puts 'Synthetic failure boundary and forward recovery verified.'
