class OperationReminderSweepJob < ApplicationJob
  queue_as :default

  def perform
    # Processing records left by a terminated worker can be safely reclaimed;
    # the delivery job rechecks their state under the same project lock.
    due = OperationReminderDelivery.unscoped.where('send_at <= ?', Time.current)
    due.where(state: %w[pending failed]).or(due.where(state: 'processing').where('claimed_at < ?', 15.minutes.ago)).find_each do |delivery|
      OperationReminderDeliveryJob.perform_later(delivery.id)
    end
  end
end
