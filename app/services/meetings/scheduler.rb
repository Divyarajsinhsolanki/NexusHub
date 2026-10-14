module Meetings
  class Scheduler
    class Invalid < StandardError; end
    def initialize(user:)
      @user = user
    end
    def save(meeting, attributes:, invitee_ids: nil)
      meeting.with_lock do
        raise Invalid, 'Only the organizer can change this meeting' if meeting.persisted? && meeting.organizer_id != @user.id
        raise Invalid, 'A started or canceled meeting cannot be rescheduled' if meeting.persisted? && (meeting.call_session_id? || meeting.status != 'scheduled')
        meeting.assign_attributes(attributes)
        raise Invalid, 'Choose a future start time' unless meeting.starts_at && meeting.starts_at > Time.current
        users = if invitee_ids
          ids = Array(invitee_ids).map(&:to_i).uniq - [@user.id]
          raise Invalid, 'Invite at most 100 people per meeting' if ids.length > 100
          records = User.where(id: ids, workspace_id: meeting.workspace_id, status: 'active', deleted_at: nil).where.not(id: AccountDeletionRequest.where(status: 'scheduled').select(:user_id)).to_a
          raise Invalid, 'Every invitee must be an active member of this workspace' unless records.map(&:id).sort == ids.sort
          records
        end
        changed = meeting.changed?
        meeting.save!
        existing = meeting.meeting_invitations.includes(:user, :calendar_event).to_a
        if users
          keep = users.map(&:id) + [@user.id]
          existing.reject { |invitation| keep.include?(invitation.user_id) }.each do |invitation|
            notify(meeting, invitation.user, 'meeting_invitation_withdrawn')
            invitation.destroy!
          end
          ([ @user ] + users).each do |person|
            invitation = meeting.meeting_invitations.find_or_initialize_by(user: person)
            fresh = invitation.new_record?
            invitation.workspace = meeting.workspace
            invitation.response = 'accepted' if person.id == @user.id
            invitation.save!
            sync_calendar(meeting, invitation)
            notify(meeting, person, 'meeting_invitation') if fresh && person.id != @user.id
            notify(meeting, person, 'meeting_rescheduled') if !fresh && changed && person.id != @user.id
          end
        else
          existing.each do |invitation|
            sync_calendar(meeting, invitation)
            notify(meeting, invitation.user, 'meeting_rescheduled') if changed && invitation.user_id != @user.id
          end
        end
      end
      meeting
    end
    def respond(meeting, response)
      raise Invalid, 'Choose accept or decline' unless %w[accepted declined].include?(response)
      meeting.with_lock do
        raise Invalid, 'This meeting is no longer available' unless meeting.status == 'scheduled' && meeting.ends_at > Time.current
        invitation = meeting.meeting_invitations.find_by!(user: @user)
        raise Invalid, 'The organizer cannot decline their own meeting' if meeting.organizer_id == @user.id && response == 'declined'
        invitation.update!(response: response)
        sync_calendar(meeting, invitation)
      end
      meeting
    end
    def cancel(meeting)
      meeting.with_lock do
        raise Invalid, 'Only the organizer can cancel this meeting' unless meeting.organizer_id == @user.id
        return meeting if meeting.status == 'canceled'
        meeting.update!(status: 'canceled')
        meeting.meeting_invitations.includes(:user, :calendar_event).each do |invitation|
          invitation.calendar_event&.update!(status: 'cancelled')
          notify(meeting, invitation.user, 'meeting_canceled') unless invitation.user_id == @user.id
        end
        session = meeting.call_session
        if session&.live?
          self.class.end_session(session, reason: 'scheduled_canceled')
        end
      end
      meeting
    end
    def join(meeting)
      meeting.with_lock do
        raise Invalid, 'This meeting is canceled or has finished' unless meeting.status == 'scheduled' && meeting.ends_at > Time.current
        invitation = meeting.meeting_invitations.find_by!(user: @user)
        raise Invalid, 'Accept the invitation before joining' if invitation.response == 'declined'
        raise Invalid, 'Joining opens 15 minutes before the start' if meeting.starts_at > 15.minutes.from_now
        session = meeting.call_session
        if session && !session.live? && session.ended_reason == 'empty' && !session.call_participants.where.not(joined_at: nil).exists?
          meeting.update!(call_session: nil)
          session = nil
        end
        unless session
          raise Invalid, 'Waiting for the organizer to start the meeting' unless meeting.organizer_id == @user.id
          raise Invalid, Chat::LivekitTokenGenerator.configuration_error unless Chat::LivekitTokenGenerator.configured?
          conversation = Conversation.create!(workspace: meeting.workspace, creator: @user, conversation_type: 'group', title: meeting.title)
          conversation.conversation_participants.create!(workspace: meeting.workspace, user: @user)
          session = Chat::CallManager.new(user: @user).create_call(conversation: conversation, call_type: meeting.call_type, meeting: true)
          session.update!(host_approval_required: true)
          meeting.update!(call_session: session)
        end
        raise Invalid, 'This meeting has ended' unless session.live?
        session
      end
    end
    def self.end_session(session, reason:)
      session.with_lock do
        return unless session.live?
        session.call_participants.where(status: %w[joined ringing waiting]).update_all(status: 'left', left_at: Time.current, updated_at: Time.current)
        session.update!(status: 'ended', ended_reason: reason, ended_at: Time.current)
      end
      ActiveRecord.after_all_transactions_commit do
        CloseScheduledMeetingRoomJob.perform_later(session.id)
        Chat::Broadcaster.broadcast_call_event(session.reload, 'call_ended')
      end
    end
    private
    def sync_calendar(meeting, invitation)
      event = invitation.calendar_event || CalendarEvent.new(workspace: meeting.workspace, user: invitation.user, scheduled_meeting: meeting)
      replace_reminders = event.new_record? || event.cancelled? || event.start_at != meeting.starts_at || event.end_at != meeting.ends_at
      event.assign_attributes(title: meeting.title, description: meeting.description, start_at: meeting.starts_at, end_at: meeting.ends_at, all_day: false, event_type: 'meeting', visibility: 'personal', status: invitation.response == 'declined' ? 'cancelled' : 'scheduled', location_or_meet_link: "#{ENV['FRONTEND_URL'].presence || ENV['BASE_URL'].presence || 'https://divyarajsinh.com'}/chat?meeting=#{meeting.id}")
      event.save!
      invitation.update!(calendar_event: event) unless invitation.calendar_event_id == event.id
      if invitation.response == 'declined'
        event.event_reminders.destroy_all
      elsif replace_reminders
        event.event_reminders.destroy_all
        [15, 0].each do |minutes|
          next if meeting.starts_at - minutes.minutes < Time.current
          event.event_reminders.create!(workspace: meeting.workspace, channel: 'in_app', minutes_before: minutes)
        end
      end
    end
    def notify(meeting, recipient, action)
      Notification.create!(workspace: meeting.workspace, recipient: recipient, actor: @user, action: action, notifiable: meeting, metadata: {scheduled_meeting_id: meeting.id, meeting_title: meeting.title, starts_at: meeting.starts_at.iso8601})
    end
  end
end
