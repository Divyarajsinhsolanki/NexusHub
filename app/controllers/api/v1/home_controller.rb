class Api::V1::HomeController < Api::V1::BaseController
  def show
    assigned_tasks = Task.includes(:assigned_user, :developer)
                         .where(developer_id: current_user.id)
                         .or(Task.includes(:assigned_user, :developer).where(assigned_to_user: current_user.id))
    open_tasks = assigned_tasks.where.not(status: ["completed", "done"])
    today_logs = current_user.work_logs.where(log_date: Date.current)

    render_data(
      {
        summary: {
          open_tasks: open_tasks.count,
          due_today: open_tasks.where(end_date: Date.current).count,
          active_projects: Project.where(status: "running").count,
          work_minutes_today: today_logs.sum(:actual_minutes),
          unread_notifications: current_user.notifications.unread.count
        },
        tasks: open_tasks.order(Arel.sql("end_date ASC NULLS LAST"), :id).limit(5).map { |task| serialize_task(task) }
      }
    )
  end
end
