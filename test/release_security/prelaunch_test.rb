require 'minitest/autorun'
require 'open3'
require 'rbconfig'
require_relative '../../lib/recovery/deployment_safety'
class PrelaunchReleaseTest < Minitest::Test
  def test_unbacked_migration_policy_requires_explicit_production_opt_in
    policy = Recovery::DeploymentSafety
    refute policy.allow_unbacked_migrations?({})
    %w[false 1 yes].each { |value| refute policy.allow_unbacked_migrations?({ 'PRELAUNCH_ALLOW_UNBACKED_MIGRATIONS' => value }) }
    assert policy.allow_unbacked_migrations?({ 'PRELAUNCH_ALLOW_UNBACKED_MIGRATIONS' => 'true' })
    %w[staging restore invalid].each do |tier|
      refute policy.allow_unbacked_migrations?({ 'DEPLOYMENT_TIER' => tier, 'PRELAUNCH_ALLOW_UNBACKED_MIGRATIONS' => 'true' })
    end
  end
  def test_actual_migration_preflight_only_skips_backup_access_when_opted_in
    script = <<~RUBY
      require 'rake'
      module Rails
        def self.env = Struct.new(:production?).new(true)
      end
      task :environment
      %w[db:migrate db:rollback db:migrate:down].each { |name| task name }
      load './lib/tasks/recovery.rake'
      Recovery::Toolkit.define_singleton_method(:new) { |*| raise 'backup-access-sentinel' }
      Rake::Task['recovery:migration_preflight'].invoke
    RUBY
    %w[true false].each do |flag|
      _, error, status = Open3.capture3({ 'DEPLOYMENT_TIER' => 'production', 'PRELAUNCH_ALLOW_UNBACKED_MIGRATIONS' => flag }, RbConfig.ruby, '-e', script,
        chdir: File.expand_path('../..', __dir__))
      assert_equal flag == 'true', status.success?, error
      assert_includes error, flag == 'true' ? 'PRELAUNCH: migrating without offsite backup evidence' : 'Migration preflight failed'
    end
  end
end
