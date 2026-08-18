class Api::NotificationsController < Api::BaseController
  PAGE_SIZE = 20
  LEGACY_ACTION_FILTERS = {
    "assigned" => %w[assigned project_assigned task_assigned issue_assigned team_member_added],
    "commented" => %w[commented post_commented],
    "update" => %w[update task_updated issue_updated],
    "chat_ping" => %w[chat_ping chat_mention],
    "reacted" => %w[reacted message_reacted],
    "missed_call" => %w[missed_call missed_audio_call missed_video_call]
  }.freeze

  def index
    notifications_scope = current_user.notifications.visible_in_feed.includes(:actor, :notifiable).recent
    notifications_scope = apply_status_filter(notifications_scope)
    notifications_scope = apply_action_filter(notifications_scope)
    notifications_scope = apply_notifiable_type_filter(notifications_scope)

    current_page = requested_page
    total_count = notifications_scope.count
    unread_count = current_user.notifications.visible_in_feed.unread.count
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
          event_type: n.catalog.event_type,
          category: n.catalog.category,
          title: n.catalog.title,
          group_key: n.group_key,
          deep_link: n.catalog.deep_link,
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
    notification = current_user.notifications.visible_in_feed.find(params[:id])
    notification.mark_as_read!
    render json: { success: true }
  end

  def mark_all_read
    current_user.notifications.visible_in_feed.unread.update_all(read_at: Time.current)
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
    notification.catalog.message
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

    scope.where(action: LEGACY_ACTION_FILTERS.fetch(params[:action_type], params[:action_type]))
  end

  def apply_notifiable_type_filter(scope)
    return scope if params[:notifiable_type].blank?

    scope.where(notifiable_type: params[:notifiable_type])
  end
end
