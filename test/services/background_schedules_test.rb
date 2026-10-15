require 'test_helper'
require 'sidekiq/cron/job'
require 'minitest/mock'

class BackgroundSchedulesTest < ActiveJob::TestCase
  test 'call presence reconciliation runs every minute through ActiveJob' do
    definition = BackgroundSchedules.definitions(environment: 'production').fetch('production:call-presence')
    assert_equal '* * * * * UTC', definition.fetch('cron')
    assert_equal 'CallPresenceSweepJob', definition.fetch('class')
    assert_equal true, definition.fetch('active_job')
  end

  test 'cron daily publishing adds the production queue prefix exactly once' do
    previous = DailyKnowledgePublishJob.queue_name_prefix
    DailyKnowledgePublishJob.queue_name_prefix = 'nexus_hub_production'
    definition = BackgroundSchedules.definitions(environment: 'production').fetch('production:daily-knowledge')
    assert_equal '*/15 * * * * UTC', definition.fetch('cron')
    job = Sidekiq::Cron::Job.new(definition.merge('name' => 'daily-queue-test', 'status' => 'enabled', 'last_enqueue_time' => Time.current.utc.iso8601))
    job.define_singleton_method(:save_last_enqueue_time) {}
    job.define_singleton_method(:add_jid_history) { |_jid| }
    assert_enqueued_with(job: DailyKnowledgePublishJob, queue: 'nexus_hub_production_default') do
      job.enqueue!
    end
  ensure
    DailyKnowledgePublishJob.queue_name_prefix = previous
  end
end

class ResourceMaintenanceTest < ActiveJob::TestCase
  test "resource cleanup has a durable hourly ActiveJob schedule" do
    definition = BackgroundSchedules.definitions(environment: "production").fetch("production:resource-maintenance")
    assert_equal "17 * * * * UTC", definition.fetch("cron")
    assert_equal "ResourceMaintenanceJob", definition.fetch("class")
    assert definition.fetch("active_job")
  end

  test "maintenance expires abandoned queued work and preserves active or recent operations" do
    workspace = Workspace.create!(name: "Maintenance", slug: "resource-maintenance", kind: "private")
    user = create_test_user(workspace:, email: "maintenance@example.test")
    Current.user, Current.workspace = user, workspace
    abandoned = user.pdf_document_operations.create!(workspace:, kind: "merge", parameters: {}, created_at: 2.hours.ago)
    active = user.pdf_document_operations.create!(workspace:, kind: "merge", status: "processing", parameters: {}, created_at: 2.hours.ago)
    recent = user.pdf_document_operations.create!(workspace:, kind: "merge", parameters: {})
    AbusePrevention::Maintenance.expire_pdf_queue!
    assert_equal "failed", abandoned.reload.status
    assert_equal "processing", active.reload.status
    assert_equal "queued", recent.reload.status
  end

  test "maintenance purges only abandoned unattached bytes" do
    workspace = Workspace.create!(name: "Purge maintenance", slug: "purge-maintenance", kind: "private")
    user = create_test_user(workspace:, email: "purge-maintenance@example.test")
    Current.user, Current.workspace = user, workspace
    orphan = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("orphan"), filename: "orphan.txt")
    orphan.update_columns(created_at: 2.days.ago)
    user.cover_photo.attach(io: StringIO.new("attached"), filename: "cover.txt")
    user.cover_photo.blob.update_columns(created_at: 2.days.ago)
    clear_enqueued_jobs
    AbusePrevention::Maintenance.purge_abandoned_uploads!
    assert_enqueued_with(job: ActiveStorage::PurgeJob, args: [orphan])
    refute enqueued_jobs.any? { |job| job[:args].to_s.include?(user.cover_photo.blob.to_global_id.to_s) }
  end
end
