class Api::V1::NotificationsController < Api::V1::BaseController
  def index
    notifications = current_user.notifications.includes(:actor, :notifiable).recent
    notifications = notifications.unread if params[:status] == "unread"
    notifications = notifications.where.not(read_at: nil) if params[:status] == "read"

    render_paginated_data(
      notifications,
      serializer: method(:serialize_notification),
      per_page: 20,
      extra_meta: { unread_count: current_user.notifications.unread.count }
    )
  end

  def read
    notification = current_user.notifications.find(params[:id])
    notification.mark_as_read!
    render_data(serialize_notification(notification))
  end

  def read_all
    current_user.notifications.unread.update_all(read_at: Time.current, updated_at: Time.current)
    render_data({ marked_read: true })
  end
end
