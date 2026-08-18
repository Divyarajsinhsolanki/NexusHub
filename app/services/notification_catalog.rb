class NotificationCatalog
  CATEGORY_CHANNELS = {
    "chat" => "nexus_chat_v1",
    "audio_calls" => "nexus_audio_calls_v1",
    "video_calls" => "nexus_video_calls_v1",
    "work" => "nexus_work_v1",
    "social" => "nexus_social_v1",
    "reminders" => "nexus_reminders_v1"
  }.freeze

  CATEGORY_SOUNDS = {
    "chat" => "nexus_chat.wav",
    "audio_calls" => "nexus_audio_call.wav",
    "video_calls" => "nexus_video_call.wav",
    "work" => "nexus_work.wav",
    "social" => "nexus_social.wav",
    "reminders" => "nexus_reminder.wav"
  }.freeze

  CHAT_ACTIONS = %w[chat_message chat_mention message_reacted].freeze
  WORK_ACTIONS = %w[project_assigned task_assigned task_updated issue_assigned issue_updated team_member_added].freeze
  SOCIAL_ACTIONS = %w[post_liked post_commented skill_endorsed].freeze
  REMINDER_ACTIONS = %w[calendar_reminder].freeze
  MISSED_CALL_ACTIONS = %w[missed_audio_call missed_video_call].freeze
  ENDED_CALL_ACTIONS = %w[ended_audio_call ended_video_call].freeze
  CALL_ACTIONS = (MISSED_CALL_ACTIONS + ENDED_CALL_ACTIONS).freeze
  LEGACY_PUSH_ACTIONS = %w[
    assigned commented update chat_message chat_ping reacted missed_call calendar_reminder
    project_assigned task_assigned task_updated post_commented chat_mention message_reacted
    missed_audio_call missed_video_call ended_audio_call ended_video_call
  ].freeze

  attr_reader :notification, :metadata, :event_type

  def initialize(notification)
    @notification = notification
    @metadata = (notification.metadata || {}).with_indifferent_access
    @event_type = canonical_event_type(notification.action, notification.notifiable_type, metadata)
  end

  def self.for(notification)
    new(notification)
  end

  def self.canonical_event_type(action, notifiable_type = nil, metadata = {})
    new(Struct.new(:action, :notifiable_type, :metadata).new(action, notifiable_type, metadata)).event_type
  end

  def category
    return "chat" if CHAT_ACTIONS.include?(event_type)
    return "work" if WORK_ACTIONS.include?(event_type)
    return "social" if SOCIAL_ACTIONS.include?(event_type)
    return "reminders" if REMINDER_ACTIONS.include?(event_type)
    return "video_calls" if event_type == "missed_video_call"
    return "audio_calls" if event_type == "missed_audio_call"
    return "video_calls" if event_type == "ended_video_call"
    return "audio_calls" if event_type == "ended_audio_call"

    "work"
  end

  def channel_id
    CATEGORY_CHANNELS.fetch(category)
  end

  def sound
    CATEGORY_SOUNDS.fetch(category)
  end

  def group_key
    case category
    when "chat", "audio_calls", "video_calls"
      "conversation:#{metadata[:conversation_id] || related_id}"
    when "social"
      social_group_key
    when "reminders"
      "event:#{metadata[:calendar_event_id] || related_id}"
    else
      work_group_key
    end
  end

  def title
    value = case event_type
    when "chat_message" then metadata[:conversation_name].presence || "New message"
    when "chat_mention" then "Mention in #{metadata[:conversation_name].presence || 'Chat'}"
    when "message_reacted" then "New message reaction"
    when "missed_audio_call" then "Missed audio call"
    when "missed_video_call" then "Missed video call"
    when "ended_audio_call" then "Audio call ended"
    when "ended_video_call" then "Video call ended"
    when "project_assigned" then "Project assigned"
    when "task_assigned" then "Task assigned"
    when "task_updated" then "Task updated"
    when "issue_assigned" then "Issue assigned"
    when "issue_updated" then "Issue updated"
    when "team_member_added" then "Added to a team"
    when "post_liked" then "New post like"
    when "post_commented" then "New post comment"
    when "skill_endorsed" then "Skill endorsed"
    when "calendar_reminder" then "Upcoming event"
    else "Nexus Hub"
    end
    sanitized_preview(value).truncate(80)
  end

  def message(previews: true, aggregate_count: 1)
    return privacy_safe_message unless previews
    return aggregate_message(aggregate_count) if aggregate_count.to_i > 1

    actor = notification.actor&.full_name.presence || "Someone"
    case event_type
    when "chat_message"
      preview = sanitized_preview(metadata[:message_preview])
      preview.present? ? "#{actor}: #{preview}" : "#{actor} sent a message"
    when "chat_mention"
      "#{actor} mentioned you#{conversation_suffix}"
    when "message_reacted"
      emoji = metadata[:emoji].presence
      emoji ? "#{actor} reacted #{emoji} to your message" : "#{actor} reacted to your message"
    when "missed_audio_call", "missed_video_call"
      "You missed a call from #{actor}"
    when "ended_audio_call", "ended_video_call"
      "#{actor} ended the call"
    when "project_assigned"
      "#{actor} added you to #{metadata[:project_name].presence || 'a project'}"
    when "task_assigned"
      "#{actor} assigned you #{task_label}"
    when "task_updated"
      change = sanitized_preview(metadata[:change_summary])
      change.present? ? "#{actor} updated #{task_label}: #{change}" : "#{actor} updated #{task_label}"
    when "issue_assigned"
      "#{actor} assigned you #{issue_label}"
    when "issue_updated"
      status = metadata[:status].presence
      status ? "#{actor} changed #{issue_label} to #{status}" : "#{actor} updated #{issue_label}"
    when "team_member_added"
      "#{actor} added you to #{metadata[:team_name].presence || 'a team'}"
    when "post_liked"
      "#{actor} liked your post"
    when "post_commented"
      preview = sanitized_preview(metadata[:comment_body])
      preview.present? ? "#{actor}: #{preview}" : "#{actor} commented on your post"
    when "skill_endorsed"
      "#{actor} endorsed you for #{metadata[:skill_name].presence || 'a skill'}"
    when "calendar_reminder"
      "#{metadata[:event_title].presence || 'An event'} is coming up"
    else
      "You have a new notification"
    end
  end

  def privacy_safe_message
    return "An audio call has ended" if event_type == "ended_audio_call"
    return "A video call has ended" if event_type == "ended_video_call"

    case category
    when "chat" then "You have new chat activity"
    when "audio_calls" then "You missed an audio call"
    when "video_calls" then "You missed a video call"
    when "social" then "You have new social activity"
    when "reminders" then "You have an upcoming reminder"
    else "A work item needs your attention"
    end
  end

  def deep_link
    case event_type
    when *CHAT_ACTIONS
      conversation_id = metadata[:conversation_id]
      conversation_id ? "/chat/#{conversation_id}" : "/inbox"
    when *CALL_ACTIONS
      conversation_id = metadata[:conversation_id]
      call_id = metadata[:call_session_id]
      return "/call/#{call_id}" if call_id
      return "/chat/#{conversation_id}" if conversation_id

      "/inbox"
    when "post_liked", "post_commented"
      post_id = metadata[:post_id] || related_post_id
      post_id ? "/inbox/post/#{post_id}" : "/inbox"
    when "project_assigned"
      project_id = metadata[:project_id] || related_project_id
      project_id ? "/projects/#{project_id}" : "/projects"
    when "task_assigned", "task_updated"
      project_id = metadata[:project_id] || related_project_id
      task_id = metadata[:task_id] || related_id
      project_id ? "/projects/#{project_id}?taskId=#{task_id}" : "/work"
    when "issue_assigned", "issue_updated"
      project_id = metadata[:project_id] || related_project_id
      issue_id = metadata[:issue_id] || related_id
      project_id ? "/projects/#{project_id}/issues?issueId=#{issue_id}" : "/projects"
    when "team_member_added"
      team_id = metadata[:team_id] || related_team_id
      team_id ? "/more/teams/#{team_id}" : "/more/teams"
    when "skill_endorsed"
      "/more/profile?tab=skills"
    when "calendar_reminder"
      event_id = metadata[:calendar_event_id] || related_id
      event_id ? "/more/calendar?eventId=#{event_id}" : "/more/calendar"
    else
      "/inbox/notifications"
    end
  rescue ActiveRecord::RecordNotFound
    "/inbox/notifications"
  end

  def dispatch_delay
    return 2.seconds if category == "chat"
    return 10.seconds if %w[work social].include?(category)

    0.seconds
  end

  def aggregation_window
    dispatch_delay.positive? ? dispatch_delay : 1.second
  end

  def legacy_push_supported?
    LEGACY_PUSH_ACTIONS.include?(notification.action.to_s) || LEGACY_PUSH_ACTIONS.include?(event_type)
  end

  def category_id
    return "chat_message_actions" if %w[chat_message chat_mention].include?(event_type)
    return "missed_call_actions" if MISSED_CALL_ACTIONS.include?(event_type)

    nil
  end

  def feed_preference_key
    case event_type
    when "post_commented" then "commented"
    when "post_liked", "skill_endorsed" then event_type
    when "project_assigned", "task_assigned", "issue_assigned", "team_member_added" then "assigned"
    when "task_updated", "issue_updated" then "update"
    when "chat_mention" then "chat_ping"
    when "message_reacted" then "reacted"
    when "missed_audio_call", "missed_video_call" then "missed_call"
    when "ended_audio_call", "ended_video_call" then event_type
    else event_type
    end
  end

  private

  def canonical_event_type(action, notifiable_type, values)
    case action.to_s
    when "assigned"
      notifiable_type.to_s == "ProjectUser" ? "project_assigned" : "task_assigned"
    when "commented" then "post_commented"
    when "update" then "task_updated"
    when "chat_ping" then "chat_mention"
    when "reacted" then "message_reacted"
    when "missed_call"
      values.to_h.with_indifferent_access[:call_type].to_s == "video" ? "missed_video_call" : "missed_audio_call"
    else action.to_s.presence || "notification"
    end
  end

  def aggregate_message(count)
    case event_type
    when "chat_message", "chat_mention"
      "#{count} new messages#{conversation_suffix}"
    when "message_reacted"
      "#{count} new reactions to your messages"
    when "post_liked"
      "#{count} people liked your post"
    when "post_commented"
      "#{count} new comments on your post"
    when "task_updated"
      "#{count} updates to #{task_label}"
    when "issue_updated"
      "#{count} updates to #{issue_label}"
    else
      "#{count} new #{category.tr('_', ' ')} notifications"
    end
  end

  def conversation_suffix
    name = metadata[:conversation_name].presence
    name ? " in #{name}" : ""
  end

  def task_label
    metadata[:task_title].presence || metadata[:task_key].presence || "a task"
  end

  def issue_label
    metadata[:issue_key].presence || metadata[:issue_title].presence || "an issue"
  end

  def social_group_key
    return "skill:#{metadata[:user_skill_id] || related_id}" if event_type == "skill_endorsed"

    "post:#{metadata[:post_id] || related_post_id || related_id}"
  end

  def work_group_key
    case event_type
    when "project_assigned" then "project:#{metadata[:project_id] || related_project_id || related_id}"
    when "task_assigned", "task_updated" then "task:#{metadata[:task_id] || related_id}"
    when "issue_assigned", "issue_updated" then "issue:#{metadata[:issue_id] || related_id}"
    when "team_member_added" then "team:#{metadata[:team_id] || related_team_id || related_id}"
    else "notification:#{notification.id || SecureRandom.uuid}"
    end
  end

  def related_id
    notification.notifiable_id
  end

  def related_project_id
    object = notification.notifiable
    return object.project_id if object.respond_to?(:project_id)
    return object.id if object.is_a?(Project)

    nil
  end

  def related_post_id
    object = notification.notifiable
    return object.post_id if object.respond_to?(:post_id)
    return object.id if object.is_a?(Post)

    nil
  end

  def related_team_id
    object = notification.notifiable
    return object.team_id if object.respond_to?(:team_id)
    return object.id if object.is_a?(Team)

    nil
  end

  def sanitized_preview(value)
    ActionView::Base.full_sanitizer.sanitize(value.to_s).squish.truncate(120)
  end
end
