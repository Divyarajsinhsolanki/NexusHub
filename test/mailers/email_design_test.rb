require 'test_helper'
require 'ostruct'

class EmailDesignTest < ActiveSupport::TestCase
  setup do
    @workspace = Workspace.create!(name: 'Example workspace', slug: 'email-design', kind: 'private')
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: 'preview@example.test')
    @other = create_test_user(workspace: @workspace, email: 'caller@example.test')
  end

  test 'reminders and alerts render shared HTML with plain text alternatives' do
    event = OpenStruct.new(user: @user, title: 'Release planning', start_at: Time.current, description: 'Review the release checklist.', location_or_meet_link: 'https://example.test/meeting')
    check_email(CalendarEventReminderMailer.reminder(OpenStruct.new(calendar_event: event, minutes_before: 15)), 'calendar')
    bookmark = OpenStruct.new(user: @user, card_type: 'article', collection_name: 'Engineering', created_at: Time.current, payload: { title: 'Designing better workflows', summary: 'A practical guide for the team.' })
    check_email(KnowledgeBookmarkMailer.reminder(bookmark), 'knowledge')
    issue = OpenStruct.new(id: 8, issue_key: 'APP-8', title: 'Improve the onboarding flow', project_id: 3, project: OpenStruct.new(name: 'Workspace app'), status: 'In Progress', assignee: 'Alex', due_date: Date.current, issue_description: 'Review the first-run experience.')
    check_email(IssueMailer.issue_update(issue, previous_status: 'New', previous_assignee: 'Sam', targets: [@user.email]), 'issue')
    source = ProjectDeployment.new(id: 4, project_id: 3, name: 'October release', scheduled_at: 1.day.from_now, time_zone: 'Asia/Kolkata')
    check_email(OperationReminderMailer.reminder(OpenStruct.new(id: 9, source: source, recipient: @user)), 'operations')
    error = ErrorNotificationMailer.exception_report(exception_class: 'RuntimeError', message: '<script>alert(1)</script>', backtrace: ['app/services/example.rb:42'], request_context: { path: '/projects', method: 'GET' })
    html = check_email(error, 'error')
    assert_includes html, '&lt;script&gt;'
    assert_no_match(/<script>/, html)
  end

  test 'security emails preserve their action links and verification codes' do
    reset = check_email(Devise.mailer.reset_password_instructions(@user, 'sample-reset-token'), 'password-reset')
    assert_includes reset, 'reset-password?token=sample-reset-token'
    confirmation = check_email(Devise.mailer.confirmation_instructions(@user, 'sample-confirm-token'), 'confirmation')
    assert_includes confirmation, 'sample-confirm-token'
    key = Rails.application.key_generator.generate_key('account-deletion-code', 32)
    encrypted = ActiveSupport::MessageEncryptor.new(key).encrypt_and_sign('123456')
    html = check_email(AccountLifecycleMailer.verification(@user, encrypted), 'account-deletion')
    assert_includes html, '123456'
    raw = 'a' * 43
    invitation = WorkspaceInvitation.create!(workspace: @workspace, invited_by: @user, email: 'invited@example.test', role_names: ['member'], project_ids: [], token_digest: WorkspaceInvitation.digest(raw), expires_at: 7.days.from_now)
    html = check_email(WorkspaceInvitationMailer.invitation(invitation.id, WorkspaceInvitation.encrypt_token(raw)), 'invitation')
    assert_includes html, "invitations/accept#token=#{raw}"
  end

  test 'missed calls and privacy requests use the common layout' do
    conversation = Conversation.create!(workspace: @workspace, creator: @other, conversation_type: 'group', title: 'Design team')
    [@user, @other].each { |user| conversation.conversation_participants.create!(workspace: @workspace, user: user) }
    call = conversation.call_sessions.create!(workspace: @workspace, initiator: @other, call_type: 'video', status: 'ended', livekit_room_name: 'email-preview')
    html = check_email(CallMailer.missed_call(@user, call), 'missed-call')
    assert_includes html, "/chat/#{conversation.id}"
    request = PrivacyRequest.create!(request_type: 'access', payload: { email: @user.email })
    check_email(PrivacyRequestMailer.verification(request.id), 'privacy-verification')
    request.update!(email_verified_at: Time.current)
    check_email(PrivacyRequestMailer.status_changed(request.id), 'privacy-update')
  end

  private

  def check_email(delivery, name)
    email = delivery.message
    assert email.multipart?, "#{name} needs an HTML and plain-text alternative"
    assert email.text_part, "#{name} lost its text alternative"
    assert email.html_part, "#{name} has no HTML"
    html = email.html_part.body.decoded
    assert_equal 1, html.scan(/<!DOCTYPE html>/i).size, "#{name} has nested email documents"
    icon = email.attachments['nexushub-icon.png']
    assert icon&.inline?, "#{name} needs the inline web icon"
    assert_equal File.binread(Rails.root.join('app/javascript/images/sparkle.png')), icon.body.decoded
    assert_includes html, "cid:#{icon.content_id.delete('<>')}"
    assert_includes html, 'YOUR WORK, CONNECTED' , "#{name} is missing the shared layout"
    assert_includes html, 'role="presentation"'
    assert_includes html, 'name="viewport"'
    assert email.text_part.body.decoded.strip.present?
    if ENV['EMAIL_PREVIEW_DIR'].present?
      FileUtils.mkdir_p(ENV['EMAIL_PREVIEW_DIR'])
      File.write(File.join(ENV['EMAIL_PREVIEW_DIR'], "#{name}.html"), html)
      File.write(File.join(ENV['EMAIL_PREVIEW_DIR'], "#{name}.txt"), email.text_part.body.decoded)
    end
    html
  end
end
