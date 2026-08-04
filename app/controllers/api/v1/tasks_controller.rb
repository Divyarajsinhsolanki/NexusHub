class Api::V1::TasksController < Api::V1::BaseController
  STATUSES = %w[todo inprogress completed].freeze

  before_action :set_task, only: [:show, :update]

  def index
    tasks = Task.includes(:assigned_user, :developer)
                .order(Arel.sql('tasks."order" ASC NULLS LAST'), :id)
    tasks = tasks.where(project_id: params[:project_id]) if params[:project_id].present?
    tasks = tasks.where(sprint_id: params[:sprint_id]) if params[:sprint_id].present?
    tasks = tasks.where(status: params[:status]) if params[:status].present?
    tasks = tasks.where(type: params[:type]) if params[:type].present?
    tasks = assigned_to_current_user(tasks) if ActiveModel::Type::Boolean.new.cast(params[:mine])

    begin
      tasks = tasks.where("end_date >= ?", Date.iso8601(params[:due_from])) if params[:due_from].present?
      tasks = tasks.where("end_date <= ?", Date.iso8601(params[:due_to])) if params[:due_to].present?
    rescue Date::Error
      return render_error(
        code: "invalid_date_filter",
        message: "Due date filters must use YYYY-MM-DD.",
        status: :unprocessable_entity
      )
    end

    render_paginated_data(tasks, serializer: method(:serialize_task))
  end

  def show
    render_data(serialize_task(@task))
  end

  def update
    attributes = task_attributes
    status = attributes[:status]
    if status.present? && !STATUSES.include?(status)
      return render_error(
        code: "invalid_status",
        message: "Status must be todo, inprogress, or completed.",
        status: :unprocessable_entity
      )
    end

    @task.updated_by = current_user.id
    return render_validation_error(@task) unless @task.update(attributes)

    render_data(serialize_task(@task))
  end

  private

  def set_task
    @task = Task.includes(:assigned_user, :developer).find(params[:id])
  end

  def assigned_to_current_user(scope)
    scope.where(developer_id: current_user.id)
         .or(scope.where(assigned_to_user: current_user.id))
  end

  def task_attributes
    params.require(:task).permit(
      :task_id,
      :task_url,
      :type,
      :title,
      :description,
      :status,
      :order,
      :assigned_to_user,
      :start_date,
      :end_date,
      :estimated_hours,
      :sprint_id,
      :developer_id,
      :project_id,
      :is_struck,
      :qa_assigned,
      :internal_qa,
      :blocker,
      :demo,
      :swag_point,
      :story_point,
      :dev_hours,
      :code_review_hours,
      :dev_to_qa_hours,
      :qa_hours,
      :automation_qa_hours,
      :total_hours,
      :priority
    )
  end
end
