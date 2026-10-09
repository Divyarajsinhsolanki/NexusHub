require 'test_helper'
require 'minitest/mock'

class EventReminderJobTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  setup do
    travel_to Time.current.change(usec: 0)
    @workspace = Workspace.create!(name: 'Reminder regressions', slug: 'reminder-regressions', kind: 'private')
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: 'reminder-regressions@example.test')
    Current.user = @user
    @event = @user.calendar_events.create!(title: 'Meeting', event_type: 'meeting', start_at: 1.hour.from_now, end_at: 2.hours.from_now)
    @reminder = @event.event_reminders.create!(channel: 'in_app', minutes_before: 30)
    clear_enqueued_jobs
  end

  teardown do
    clear_enqueued_jobs
    travel_back
  end

  test 'rescheduling recalculates pending reminders and schedules their new delivery' do
    assert_enqueued_with(job: EventReminderJob, args: [@reminder.id], at: 90.minutes.from_now) do
      @event.update!(start_at: 2.hours.from_now, end_at: 3.hours.from_now)
    end
    assert_equal 90.minutes.from_now, @reminder.reload.send_at
  end

  test 'old queued jobs cannot send reminders before the latest reminder time' do
    @reminder.update!(minutes_before: 10)
    travel 30.minutes
    assert_no_difference 'Notification.unscoped.count' do
      EventReminderJob.perform_now(@reminder.id)
    end
    assert @reminder.reload.pending?
    travel 20.minutes
    assert_difference 'Notification.unscoped.count', 1 do
      EventReminderJob.perform_now(@reminder.id)
      EventReminderJob.perform_now(@reminder.id)
    end
    assert @reminder.reload.sent?
  end

  test 'rescheduling later prevents old event reminder jobs from sending early' do
    @event.update!(start_at: 2.hours.from_now, end_at: 3.hours.from_now)
    travel 30.minutes
    assert_no_difference 'Notification.unscoped.count' do
      EventReminderJob.perform_now(@reminder.id)
    end
    assert @reminder.reload.pending?
  end

  test 'cancelled and completed events do not deliver queued reminders' do
    travel 30.minutes
    %w[cancelled completed].each do |status|
      @event.update!(status: status)
      assert_no_difference 'Notification.unscoped.count' do
        EventReminderJob.perform_now(@reminder.id)
      end
      assert @reminder.reload.pending?
    end
  end

  test 'sent reminders are not reset when events move' do
    @reminder.update!(state: 'sent', sent_at: Time.current)
    old_time = @reminder.send_at
    assert_no_enqueued_jobs(only: EventReminderJob) do
      @event.update!(start_at: 2.hours.from_now, end_at: 3.hours.from_now)
    end
    assert @reminder.reload.sent?
    assert_equal old_time, @reminder.send_at
  end
end
