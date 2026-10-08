Sidekiq.configure_server do |config|
  config.redis = { url: ENV.fetch("REDIS_URL", "redis://localhost:6379/1") }
  config.on(:startup) do
    # Persist schedules in Redis and recover database-backed reminders on every
    # worker restart. Active Job supplies the environment-specific queue prefix.
    Sidekiq::Cron::Job.load_from_hash({
      "#{Rails.env}:project-statuses" => {
        'cron' => '0 * * * * UTC', 'class' => 'ProjectStatusRefreshJob', 'active_job' => true
      },
      "#{Rails.env}:operations-materialize" => {
        'cron' => '0 0 * * * UTC', 'class' => 'OperationScheduleMaterializeJob', 'active_job' => true
      },
      "#{Rails.env}:operations-reminders" => {
        'cron' => '* * * * * UTC', 'class' => 'OperationReminderSweepJob', 'active_job' => true
      }
    })
    OperationScheduleMaterializeJob.perform_later
    OperationReminderSweepJob.perform_later
    ProjectStatusRefreshJob.perform_later
  end
end

Sidekiq.configure_client do |config|
  config.redis = { url: ENV.fetch("REDIS_URL", "redis://localhost:6379/1") }
end
