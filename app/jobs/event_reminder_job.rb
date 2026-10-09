class EventReminderJob < ApplicationJob
  queue_as :default

  def perform(event_reminder_id)
    reminder = EventReminder.unscoped.includes(calendar_event: :user).find_by(id: event_reminder_id)
    return unless reminder&.pending?
    return if reminder.workspace.demo?

    Current.set(workspace: reminder.workspace) do
      # Lock in the same order as calendar rescheduling: event, then reminder.
      # Old queued jobs must check the latest schedule rather than their queue time.
      event = reminder.calendar_event
      event.with_lock do
        reminder.with_lock do
          return unless reminder.pending? && event.scheduled? && reminder.send_at <= Time.current

          EventReminderChannels::Deliverer.call(reminder)
          reminder.update!(state: 'sent', sent_at: Time.current)
        end
      end
    end
  rescue StandardError
    reminder&.update(state: 'failed') if reminder&.pending?
    raise
  end
end
