class ExpoPushNotificationJob < ApplicationJob
  queue_as :default

  def perform(notification_id)
    PushNotificationDispatchJob.perform_now(notification_id)
  end
end
