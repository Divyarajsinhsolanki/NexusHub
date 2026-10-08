class Api::V1::NotificationsController < Api::V1::BaseController
  def index
    notifications = current_user.notifications.visible_in_feed.includes(:actor, :notifiable).recent
    notifications = notifications.unread if params[:status] == "unread"
    notifications = notifications.where.not(read_at: nil) if params[:status] == "read"

    if params[:cursor] == 'true' || params[:before_id].present?
      notifications = notifications.reorder(id: :desc)
      notifications = notifications.where('notifications.id < ?', params[:before_id].to_i) if params[:before_id].present?
      rows = notifications.limit(21).to_a
      has_more = rows.size > 20
      rows = rows.first(20)
      render_data(rows.map { |notice| serialize_notification(notice) }, meta: {
        next_before_id: has_more ? rows.last.id : nil, has_more: has_more,
        unread_count: current_user.notifications.visible_in_feed.unread.count
      })
    else
      render_paginated_data(notifications, serializer: method(:serialize_notification), per_page: 20,
        extra_meta: { unread_count: current_user.notifications.visible_in_feed.unread.count })
    end
  end

  def read
    notification = current_user.notifications.visible_in_feed.find(params[:id])
    notification.mark_as_read!
    render_data(serialize_notification(notification))
  end

  def read_all
    current_user.notifications.visible_in_feed.unread.update_all(read_at: Time.current, updated_at: Time.current)
    Chat::Broadcaster.broadcast_notifications_read(current_user)
    render_data({ marked_read: true })
  end
end
