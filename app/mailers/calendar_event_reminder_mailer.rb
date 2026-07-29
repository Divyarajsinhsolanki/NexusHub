class CalendarEventReminderMailer < ApplicationMailer
  def reminder(event_reminder)
    @event_reminder = event_reminder
    @event = event_reminder.calendar_event
    @user = @event.user

    mail(
      to: @user.email,
      subject: "Reminder: #{@event.title} at #{@event.start_at.in_time_zone.strftime('%b %-d, %Y %I:%M %p')}"
    )
  end
end
