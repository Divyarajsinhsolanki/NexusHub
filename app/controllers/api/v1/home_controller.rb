class Api::V1::HomeController < Api::V1::BaseController
  def show
    task_filter = params.fetch(:task_filter, "all_open")
    unless %w[all_open due_today overdue].include?(task_filter)
      return render_error(code: "invalid_task_filter", message: "Choose all_open, due_today, or overdue.", status: :unprocessable_entity)
    end
    today = Date.current
    assigned_tasks = Task.visible_to(current_user).includes(:assigned_user, :developer)
                         .where(developer_id: current_user.id)
                         .or(Task.visible_to(current_user).includes(:assigned_user, :developer).where(assigned_to_user: current_user.id))
    open_tasks = assigned_tasks.where.not(status: ["completed", "done"])
    due_today = open_tasks.where(end_date: today)
    overdue = open_tasks.where("end_date < ?", today)
    filtered_tasks = case task_filter
    when "due_today" then due_today
    when "overdue" then overdue
    else open_tasks
    end
    today_logs = current_user.work_logs.where(log_date: today)

    render_data(
      {
        as_of_date: today.iso8601,
        summary: {
          open_tasks: open_tasks.count,
          due_today: due_today.count,
          overdue_tasks: overdue.count,
          active_projects: Project.accessible_to(current_user).current_running.count,
          work_minutes_today: today_logs.sum(:actual_minutes),
          unread_notifications: current_user.notifications.unread.count
        },
        tasks: filtered_tasks.order(Arel.sql("end_date ASC NULLS LAST"), :id).limit(5).map { |task| serialize_task(task) }
      }
    )
  end
end
