class ScheduledChatSweepJob < ApplicationJob
  queue_as :default
  def perform
    ScheduledChatMessage.unscoped.where(state: 'pending').where('send_at <= ?', Time.current).find_each do |schedule|
      ScheduledChatDeliveryJob.perform_later(schedule.id)
    end
  end
end
