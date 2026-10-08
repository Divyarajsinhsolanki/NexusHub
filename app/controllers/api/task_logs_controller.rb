class Api::TaskLogsController < Api::BaseController
  before_action :set_task_log, only: [:update, :destroy]

  def index
    task_logs = ordered_task_logs
    task_logs = task_logs.where(task_id: params[:task_id]) if params[:task_id].present?
    task_logs = task_logs.where(developer_id: params[:developer_id]) if params[:developer_id].present?
    task_logs = task_logs.where(log_date: params[:log_date]) if params[:log_date].present?

    task_logs = task_logs.where(tasks: { sprint_id: params[:sprint_id] }) if params[:sprint_id].present?
    task_logs = task_logs.where(sprints: { project_id: params[:project_id] }) if params[:project_id].present?
    task_logs = task_logs.where(tasks: { type: params[:type] }) if params[:type].present?

    render json: serialize_task_logs(task_logs)
  end

  def create
    task_log = TaskLog.new(task_log_params)
    if task_log.save
      render json: serialize_task_log(task_log), status: :created
    else
      render json: { errors: task_log.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def bulk_create
    created_logs = []

    TaskLog.transaction do
      bulk_task_log_params.each_with_index do |attributes, index|
        task_log = TaskLog.new(attributes)
        unless task_log.save
          raise BulkCreateError, "Row #{index + 1}: #{task_log.errors.full_messages.to_sentence}"
        end

        created_logs << task_log
      end
    end

    render json: serialize_task_logs(created_logs), status: :created
  rescue BulkCreateError => e
    render json: { errors: [e.message] }, status: :unprocessable_entity
  end

  def destroy_for_sprint
    return render json: { errors: ['sprint_id is required'] }, status: :unprocessable_entity if params[:sprint_id].blank?

    sprint = Sprint.where(project_id: Project.accessible_to(current_user).select(:id)).find(params[:sprint_id])
    sprint.project.authorize_edit!(current_user)
    task_logs = TaskLog.joins(:task).where(tasks: { sprint_id: sprint.id })
    deleted_count = task_logs.count
    task_logs.destroy_all

    render json: { deleted_count: deleted_count }
  end

  def update
    if @task_log.update(task_log_params)
      render json: serialize_task_log(@task_log)
    else
      render json: { errors: @task_log.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @task_log.destroy
    head :no_content
  end

  private

  def ordered_task_logs
    TaskLog.where(task_id: Task.visible_to(current_user).select(:id))
      .includes(:task, :developer)
      .left_joins(task: :sprint)
      .order(log_date: :asc)
      .order(developer_id: :asc)
      .order(Arel.sql('tasks."order" ASC NULLS LAST'))
      .order(Arel.sql(<<~SQL.squish))
        CASE task_logs.type
          WHEN 'Code' THEN 1
          WHEN 'Code review' THEN 2
          WHEN 'Dev to QA' THEN 3
          WHEN 'Testing' THEN 4
          WHEN 'Automation QA' THEN 5
          ELSE 6
        END ASC
      SQL
      .order(created_at: :asc)
      .order(id: :asc)
  end

  def set_task_log
    @task_log = TaskLog.where(task_id: Task.visible_to(current_user).select(:id)).find(params[:id])
    @task_log.task.authorize_edit!(current_user)
  end

  def task_log_params
    attributes = params.require(:task_log).permit(:task_id, :developer_id, :log_date, :type, :hours_logged, :status)
    Task.visible_to(current_user).find(attributes[:task_id]).authorize_edit!(current_user) if attributes[:task_id].present?
    attributes
  end

  def bulk_task_log_params
    Array(params.require(:task_logs)).map do |entry|
      permitted = entry.is_a?(ActionController::Parameters) ? entry : ActionController::Parameters.new(entry)
      attributes = permitted.permit(:task_id, :developer_id, :log_date, :type, :hours_logged, :status)
      Task.visible_to(current_user).find(attributes[:task_id]).authorize_edit!(current_user)
      attributes
    end
  end

  def serialize_task_logs(task_logs)
    task_logs.as_json(include: serialization_includes)
  end

  def serialize_task_log(task_log)
    task_log.as_json(include: serialization_includes)
  end

  def serialization_includes
    {
      task: {},
      developer: { only: [:id, :first_name, :last_name, :email], methods: [:name] }
    }
  end

  class BulkCreateError < StandardError; end
end
