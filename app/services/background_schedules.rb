module BackgroundSchedules
  def self.definitions(environment: Rails.env)
    {
      "#{environment}:call-presence" => {
        'cron' => '* * * * * UTC', 'class' => 'CallPresenceSweepJob', 'active_job' => true
      },
      "#{environment}:account-deletion" => {
        'cron' => '0 * * * * UTC', 'class' => 'AccountDeletionSweepJob', 'active_job' => true
      },
      "#{environment}:billing-reconciliation" => {
        'cron' => '*/15 * * * * UTC', 'class' => 'BillingReconciliationJob', 'active_job' => true
      },
      "#{environment}:scheduled-chat" => {
        'cron' => '* * * * * UTC', 'class' => 'ScheduledChatSweepJob', 'active_job' => true
      },
      "#{environment}:daily-knowledge" => {
        'cron' => '30 3 * * * UTC', 'class' => 'DailyKnowledgePublishJob', 'active_job' => true
      },
      "#{environment}:project-statuses" => {
        'cron' => '0 * * * * UTC', 'class' => 'ProjectStatusRefreshJob', 'active_job' => true
      },
      "#{environment}:operations-materialize" => {
        'cron' => '0 0 * * * UTC', 'class' => 'OperationScheduleMaterializeJob', 'active_job' => true
      },
      "#{environment}:operations-reminders" => {
        'cron' => '* * * * * UTC', 'class' => 'OperationReminderSweepJob', 'active_job' => true
      }
    }.transform_values { |definition| definition.merge('queue' => 'default') }
  end
end
