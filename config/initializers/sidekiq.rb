Sidekiq.configure_server do |config|
  config.redis = { url: ENV.fetch("REDIS_URL", "redis://localhost:6379/1") }
  config.on(:startup) do
    # Persist schedules in Redis and recover database-backed reminders on every
    # worker restart. Active Job supplies the environment-specific queue prefix.
    Sidekiq::Cron::Job.load_from_hash(BackgroundSchedules.definitions)
    AccountDeletionSweepJob.perform_later
    ScheduledChatSweepJob.perform_later
    OperationScheduleMaterializeJob.perform_later
    OperationReminderSweepJob.perform_later
    ProjectStatusRefreshJob.perform_later
    DailyKnowledgePublishJob.perform_later
  end
end

Sidekiq.configure_client do |config|
  config.redis = { url: ENV.fetch("REDIS_URL", "redis://localhost:6379/1") }
end
