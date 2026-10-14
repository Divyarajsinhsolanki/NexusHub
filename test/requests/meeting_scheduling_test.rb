require 'test_helper'
require 'minitest/mock'
class MeetingSchedulingTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper
  setup do
    @workspace=Workspace.create!(name:'Meetings',slug:'approval-meetings',kind:'private');Current.workspace=@workspace
    @host=create_test_user(workspace:@workspace,email:'schedule-host@example.test')
    @guest=create_test_user(workspace:@workspace,email:'schedule-guest@example.test')
    @outsider=create_test_user(workspace:@workspace,email:'schedule-outsider@example.test')
    @previous=ENV.to_h.slice('LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET')
    ENV['LIVEKIT_URL']='ws://media.example.test';ENV['LIVEKIT_API_KEY']='key';ENV['LIVEKIT_API_SECRET']='secret'
  end
  teardown do
    %w[LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET].each{|key|@previous.key?(key) ? ENV[key]=@previous[key] : ENV.delete(key)}
    clear_enqueued_jobs
  end
  test 'waiting guests receive no token and direct join cannot bypass approval' do
    login(@host);post '/api/meet',params:{call_type:'video'};assert_response :created
    call=CallSession.unscoped.find(JSON.parse(response.body).dig('call_session','id'))
    login(@guest);post "/api/meet/#{call.public_id}/join",params:{media_confirmation_required:true}
    assert_response :accepted;assert_nil JSON.parse(response.body)['participant_token']
    assert_equal 'waiting',call.call_participants.find_by!(user:@guest).status
    post "/api/calls/#{call.id}/join";assert_response :accepted
    post "/api/calls/#{call.id}/media_heartbeat";assert_response :unprocessable_entity
    login(@host);post "/api/calls/#{call.id}/host_action",params:{host_action:'approve',user_id:@guest.id};assert_response :success
    login(@guest);post "/api/meet/#{call.public_id}/join",params:{media_confirmation_required:true};assert_response :success
    assert JSON.parse(response.body)['participant_token']
  end
  test 'creates invitations and calendar reminders with scoped RSVP and cancellation' do
    login(@host);post '/api/scheduled_meetings',params:attributes.merge(invitee_ids:[@guest.id]);assert_response :created
    meeting=ScheduledMeeting.find(JSON.parse(response.body)['id'])
    assert_equal 2,meeting.meeting_invitations.count;assert_equal 2,CalendarEvent.where(scheduled_meeting_id:meeting.id).count
    assert_equal 4,EventReminder.joins(:calendar_event).where(calendar_events:{scheduled_meeting_id:meeting.id}).count
    notification=Notification.find_by!(recipient:@guest,action:'meeting_invitation');assert_equal "/inbox/meetings?meeting=#{meeting.id}",notification.catalog.deep_link
    login(@outsider);get "/api/scheduled_meetings/#{meeting.id}";assert_response :not_found
    login(@guest);post "/api/scheduled_meetings/#{meeting.id}/respond",params:{response:'declined'};assert_response :success
    assert_equal 'cancelled',meeting.meeting_invitations.find_by!(user:@guest).calendar_event.reload.status
    post "/api/scheduled_meetings/#{meeting.id}/cancel";assert_response :forbidden
    login(@host);post "/api/scheduled_meetings/#{meeting.id}/cancel";assert_response :success
    assert_equal 'canceled',meeting.reload.status
  end
  test 'rescheduling replaces reminders and starts one approval-enabled call near start' do
    login(@host);post '/api/scheduled_meetings',params:attributes.merge(invitee_ids:[@guest.id]);assert_response :created
    meeting=ScheduledMeeting.find(JSON.parse(response.body)['id']);old_ids=EventReminder.joins(:calendar_event).where(calendar_events:{scheduled_meeting_id:meeting.id}).pluck(:id)
    patch "/api/scheduled_meetings/#{meeting.id}",params:{starts_at:10.minutes.from_now.iso8601,ends_at:40.minutes.from_now.iso8601,lock_version:meeting.lock_version};assert_response :success
    assert_empty EventReminder.where(id:old_ids)
    login(@guest);post "/api/scheduled_meetings/#{meeting.id}/join";assert_response :unprocessable_entity
    login(@host);post "/api/scheduled_meetings/#{meeting.id}/join";assert_response :success
    id=JSON.parse(response.body)['public_id'];assert CallSession.find_by!(public_id:id).host_approval_required?
    post "/api/scheduled_meetings/#{meeting.id}/join";assert_equal id,JSON.parse(response.body)['public_id']
  end
  test 'cross-workspace invitations are rejected atomically and reminder delivery is idempotent' do
    external=Workspace.create!(name:'Outside schedule',slug:'outside-schedule',kind:'private');Current.workspace=external
    other=create_test_user(workspace:external,email:'schedule-other@example.test');Current.workspace=@workspace
    login(@host);assert_no_difference('ScheduledMeeting.unscoped.count'){post '/api/scheduled_meetings',params:attributes.merge(invitee_ids:[other.id])};assert_response :unprocessable_entity
    post '/api/scheduled_meetings',params:attributes.merge(invitee_ids:[@guest.id]);assert_response :created
    meeting=ScheduledMeeting.find(JSON.parse(response.body)['id'])
    reminder=meeting.meeting_invitations.find_by!(user:@guest).calendar_event.event_reminders.first;reminder.update!(send_at:1.minute.ago)
    assert_difference('Notification.unscoped.count',1){2.times{EventReminderJob.perform_now(reminder.id)}}
  end

  test 'denial bans the link holder and canceling a waiting request does not end the room' do
    login(@host);post '/api/meet';call=CallSession.unscoped.find(JSON.parse(response.body).dig('call_session','id'))
    login(@guest);post "/api/meet/#{call.public_id}/join";assert_response :accepted
    post "/api/calls/#{call.id}/leave";assert_response :success;assert call.reload.live?
    post "/api/meet/#{call.public_id}/join";assert_response :accepted
    login(@host);post "/api/calls/#{call.id}/host_action",params:{host_action:'reject',user_id:@guest.id};assert_response :success
    login(@guest);post "/api/meet/#{call.public_id}/join";assert_response :unprocessable_entity
  end
  test 'mobile scheduling is scoped and stale organizer edits fail without modifying dates' do
    session, = MobileSession.issue_for!(user:@host)
    headers={'Authorization'=>"Bearer #{MobileAccessToken.issue(session)[:token]}"}
    post '/api/v1/scheduled_meetings',params:attributes.merge(invitee_ids:[@guest.id]),headers:headers;assert_response :created
    meeting=ScheduledMeeting.find(JSON.parse(response.body).dig('data','id'))
    patch "/api/v1/scheduled_meetings/#{meeting.id}",params:{title:'Updated review',lock_version:meeting.lock_version},headers:headers;assert_response :success
    patch "/api/v1/scheduled_meetings/#{meeting.id}",params:{title:'Stale title',lock_version:0},headers:headers;assert_response :conflict
    assert_equal 'Updated review',meeting.reload.title
  end
  test 'canceled and declined invitations do not send reminders, and expiry ends the scheduled room' do
    login(@host);post '/api/scheduled_meetings',params:attributes.merge(invitee_ids:[@guest.id]);meeting=ScheduledMeeting.find(JSON.parse(response.body)['id'])
    reminder=meeting.meeting_invitations.find_by!(user:@guest).calendar_event.event_reminders.first
    reminder.update!(send_at:1.minute.ago)
    post "/api/scheduled_meetings/#{meeting.id}/cancel";assert_response :success
    assert_no_difference('Notification.unscoped.count'){EventReminderJob.perform_now(reminder.id)}
    post '/api/scheduled_meetings',params:{title:'Short meeting',starts_at:5.minutes.from_now.iso8601,ends_at:10.minutes.from_now.iso8601,invitee_ids:[@guest.id]}
    meeting=ScheduledMeeting.find(JSON.parse(response.body)['id']);post "/api/scheduled_meetings/#{meeting.id}/join";assert_response :success
    meeting.reload.update!(starts_at:20.minutes.ago,ends_at:1.minute.ago)
    assert_enqueued_with(job:CloseScheduledMeetingRoomJob,args:[meeting.call_session_id]){ScheduledMeetingSweepJob.perform_now}
    assert_equal 'completed',meeting.reload.status;assert_equal 'ended',CallSession.unscoped.find(meeting.call_session_id).status
  end

  test 'description edits and RSVP acceptance preserve sent reminder records' do
    login(@host);post '/api/scheduled_meetings',params:attributes.merge(invitee_ids:[@guest.id]);meeting=ScheduledMeeting.find(JSON.parse(response.body)['id'])
    reminder=meeting.meeting_invitations.find_by!(user:@guest).calendar_event.event_reminders.first;reminder.update!(state:'sent',sent_at:Time.current)
    patch "/api/scheduled_meetings/#{meeting.id}",params:{description:'Agenda updated',lock_version:meeting.lock_version};assert_response :success
    assert EventReminder.find(reminder.id).sent?
    login(@guest);post "/api/scheduled_meetings/#{meeting.id}/respond",params:{response:'accepted'};assert_response :success
    assert EventReminder.find(reminder.id).sent?
  end
  private
  def attributes
    {title:'Design review',call_type:'video',starts_at:1.hour.from_now.iso8601,ends_at:2.hours.from_now.iso8601}
  end
  def login(user)
    post '/api/login',params:{auth:{email:user.email,password:'Password!42'}};assert_response :success
  end
end
