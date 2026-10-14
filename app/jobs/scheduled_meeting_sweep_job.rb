class ScheduledMeetingSweepJob < ApplicationJob
  queue_as :default
  def perform
    ScheduledMeeting.unscoped.where(status: 'scheduled').includes(:workspace, :organizer).find_each do |meeting|
      Current.workspace = meeting.workspace
      Current.user = meeting.organizer
      next if meeting.workspace.demo?
      meeting.with_lock do
        next unless meeting.status == 'scheduled'
        session = meeting.call_session
        if !meeting.organizer.active? || meeting.organizer.account_deletion_request&.status == 'scheduled'
          Meetings::Scheduler.new(user: meeting.organizer).cancel(meeting)
        elsif meeting.ends_at > Time.current && session && !session.live? && session.ended_reason == 'empty' && !session.call_participants.where.not(joined_at: nil).exists?
          meeting.update!(call_session: nil)
        elsif meeting.ends_at <= Time.current || (session && !session.live?)
          Meetings::Scheduler.end_session(session, reason: 'scheduled_end') if session&.live?
          meeting.update!(status: 'completed')
          CalendarEvent.where(scheduled_meeting_id: meeting.id).update_all(status: 'completed', updated_at: Time.current)
        end
      end
    end
    # Explicit global join: model default scopes must not restrict recovery to
    # whichever workspace was processed last above.
    EventReminder.unscoped.joins('INNER JOIN calendar_events ON calendar_events.id = event_reminders.calendar_event_id')
      .where(state: %w[pending failed]).where('event_reminders.send_at <= ?', Time.current)
      .where(calendar_events: {status: 'scheduled'}).where.not(calendar_events: {scheduled_meeting_id: nil})
      .where('calendar_events.end_at > ?', Time.current).find_each do |reminder|
      EventReminderJob.perform_later(reminder.id)
    end
  ensure
    Current.reset_all
  end
end
