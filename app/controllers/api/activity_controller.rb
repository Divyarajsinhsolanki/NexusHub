class Api::ActivityController < Api::BaseController
  MAX_ITEMS = 40

  def index
    render json: {
      generated_at: Time.current,
      summary: summary,
      items: activity_items.first(MAX_ITEMS)
    }
  end

  private

  def summary
    today = Time.zone.today
    {
      open_assignments: assigned_tasks.where.not(status: %w[done completed complete archived cancelled]).count,
      overdue_assignments: assigned_tasks.where("end_date < ?", today).where.not(status: %w[done completed complete archived cancelled]).count,
      upcoming_events: accessible_events.where(start_at: Time.current..7.days.from_now).count,
      unread_notifications: current_user.notifications.unread.count
    }
  end

  def activity_items
    [
      task_items,
      event_items,
      notification_items,
      work_log_items,
      post_items
    ].flatten.sort_by { |item| item[:occurred_at] || Time.at(0) }.reverse
  end

  def assigned_tasks
    Task.where(assigned_to_user: current_user.id)
  end

  def task_items
    assigned_tasks.includes(:project).order(updated_at: :desc).limit(12).map do |task|
      item(
        "assignment",
        task.id,
        task.title.presence || task.task_id,
        task.project&.name || task.status,
        task.project_id ? "/projects/#{task.project_id}/dashboard?task_id=#{task.id}" : "/momentum",
        task.updated_at,
        due_at: task.end_date
      )
    end
  end

  def event_items
    accessible_events.order(start_at: :asc).limit(10).map do |event|
      item("event", event.id, event.title, event.event_type.humanize, "/calendar?event_id=#{event.id}", event.start_at, due_at: event.start_at)
    end
  end

  def notification_items
    current_user.notifications.includes(:actor).recent.limit(10).map do |notification|
      message = notification.metadata&.dig("message") || notification.action.to_s.humanize
      item("notification", notification.id, message, notification.actor&.full_name, "/notifications", notification.created_at, unread: notification.read_at.nil?)
    end
  end

  def work_log_items
    current_user.work_logs.order(updated_at: :desc).limit(8).map do |log|
      item("work_log", log.id, log.title, log.log_date.to_s, "/worklog", log.updated_at)
    end
  end

  def post_items
    Post.includes(:user).order(created_at: :desc).limit(8).map do |post|
      item("post", post.id, post.message.to_s.truncate(90), post.user&.full_name, "/posts#post-#{post.id}", post.created_at)
    end
  end

  def accessible_events
    project_ids = current_user.projects.select(:id)

    CalendarEvent
      .where(user_id: current_user.id)
      .or(CalendarEvent.where(visibility: "project", project_id: project_ids))
      .operations_visible_to(current_user)
      .where("end_at >= ?", Time.current.beginning_of_day)
      .distinct
  end

  def item(kind, id, title, subtitle, path, occurred_at, extra = {})
    {
      kind: kind,
      id: id,
      title: title,
      subtitle: subtitle,
      path: path,
      occurred_at: occurred_at
    }.merge(extra)
  end
end
