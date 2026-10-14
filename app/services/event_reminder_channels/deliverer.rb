require 'net/http'
require 'uri'

module EventReminderChannels
  class Deliverer
    def self.call(reminder)
      new(reminder).call
    end

    def initialize(reminder)
      @reminder = reminder
      @event = reminder.calendar_event
      @recipient = @event.user
    end

    def call
      case @reminder.channel
      when 'in_app'
        deliver_in_app
      when 'email'
        CalendarEventReminderMailer.reminder(@reminder).deliver_later
      when 'slack'
        deliver_slack
      else
        raise ArgumentError, "Unsupported reminder channel: #{@reminder.channel}"
      end
    end

    private

    def deliver_in_app
      if @event.scheduled_meeting && (@event.scheduled_meeting.status != 'scheduled' || !@event.scheduled_meeting.organizer.active? || @event.scheduled_meeting.organizer.account_deletion_request&.status == 'scheduled')
        return
      end
      Notification.create(
        recipient: @recipient,
        actor: @recipient,
        action: 'calendar_reminder',
        notifiable: @event,
        metadata: {
          type: 'calendar_reminder',
          scheduled_meeting_id: @event.scheduled_meeting_id,
          calendar_event_id: @event.id,
          event_title: @event.title,
          event_start_at: @event.start_at,
          channel: @reminder.channel,
          minutes_before: @reminder.minutes_before
        }
      )
    end

    def deliver_slack
      webhook_url = ENV['SLACK_WEBHOOK_URL'].to_s
      return if webhook_url.blank?

      payload = {
        text: "⏰ Reminder: #{@event.title} starts at #{@event.start_at.in_time_zone.strftime('%b %-d, %Y %I:%M %p')}"
      }

      uri = URI.parse(webhook_url)
      Net::HTTP.post(uri, payload.to_json, 'Content-Type' => 'application/json')
    end
  end
end
