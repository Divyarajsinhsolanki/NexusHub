require 'test_helper'
require 'sidekiq/cron/job'
require 'minitest/mock'

class BackgroundSchedulesTest < ActiveJob::TestCase
  test 'cron daily publishing adds the production queue prefix exactly once' do
    previous = DailyKnowledgePublishJob.queue_name_prefix
    DailyKnowledgePublishJob.queue_name_prefix = 'nexus_hub_production'
    definition = BackgroundSchedules.definitions(environment: 'production').fetch('production:daily-knowledge')
    assert_equal '30 3 * * * UTC', definition.fetch('cron')
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
