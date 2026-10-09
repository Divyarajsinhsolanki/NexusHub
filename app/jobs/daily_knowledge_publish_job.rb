class DailyKnowledgePublishJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: 15.minutes, attempts: 3

  def perform
    return unless Knowledge::DailyPublisher.enabled?
    now = Time.current.in_time_zone("Asia/Kolkata")
    return if now.hour < 9

    Knowledge::DailyPublisher.new(workspace: Knowledge::DailyPublisher.workspace).publish(date: now.to_date)
  end
end
