class Api::NotificationsController < Api::BaseController
  PAGE_SIZE = 20

  def index
    notifications_scope = current_user.notifications.includes(:actor).recent
    notifications_scope = apply_status_filter(notifications_scope)
    notifications_scope = apply_action_filter(notifications_scope)
    notifications_scope = apply_notifiable_type_filter(notifications_scope)

    current_page = requested_page
    total_count = notifications_scope.count
    unread_count = current_user.notifications.unread.count
    notifications = notifications_scope.offset((current_page - 1) * PAGE_SIZE).limit(PAGE_SIZE)

    render json: {
      notifications: notifications.map do |n|
        {
          id: n.id,
          actor: n.actor.full_name,
          actor_avatar: n.actor.profile_picture.attached? ? url_for(n.actor.profile_picture) : nil,
          action: n.action,
          notifiable_type: n.notifiable_type,
          notifiable_id: n.notifiable_id,
          read_at: n.read_at,
          created_at: n.created_at,
          metadata: n.metadata,
          message: generate_message(n)
        }
      end,
      meta: {
        total_pages: total_pages(total_count),
        current_page: current_page,
        unread_count: unread_count
      }
    }
  end

  def mark_read
    notification = current_user.notifications.find(params[:id])
    notification.mark_as_read!
    render json: { success: true }
  end

  def mark_all_read
    current_user.notifications.unread.update_all(read_at: Time.current)
    render json: { success: true }
  end

  private

  def requested_page
    page = params[:page].to_i
    page.positive? ? page : 1
  end

  def total_pages(total_count)
    (total_count.to_f / PAGE_SIZE).ceil
  end

  def generate_message(notification)
    case notification.action
    when 'assigned'
      "#{notification.actor.full_name} assigned you a task"
    when 'commented'
      "#{notification.actor.full_name} commented on your post"
    when 'update'
      "#{notification.actor.full_name} updated a task"
    when 'calendar_reminder'
      event_title = notification.metadata&.dig('event_title') || 'an event'
      "Reminder: #{event_title} is coming up"
    when 'chat_message'
      conversation_name = notification.metadata&.dig('conversation_name') || 'a conversation'
      "#{notification.actor.full_name} sent a message in #{conversation_name}"
    when 'chat_ping'
      conversation_name = notification.metadata&.dig('conversation_name') || 'a conversation'
      "#{notification.actor.full_name} mentioned you in #{conversation_name}"
    when 'missed_call'
      conversation_name = notification.metadata&.dig('conversation_name') || 'a conversation'
      call_type = notification.metadata&.dig('call_type') || 'call'
      "Missed #{call_type} call from #{notification.actor.full_name} in #{conversation_name}"
    when 'reacted'
      emoji = notification.metadata&.dig('emoji')
      emoji.present? ? "#{notification.actor.full_name} reacted #{emoji} to your message" : "#{notification.actor.full_name} reacted to your message"
    else
      "New notification"
    end
  end

  def apply_status_filter(scope)
    case params[:status]
    when "read"
      scope.where.not(read_at: nil)
    when "unread"
      scope.unread
    else
      scope
    end
  end

  def apply_action_filter(scope)
    return scope if params[:action_type].blank?

    scope.where(action: params[:action_type])
  end

  def apply_notifiable_type_filter(scope)
    return scope if params[:notifiable_type].blank?

    scope.where(notifiable_type: params[:notifiable_type])
  end
end
