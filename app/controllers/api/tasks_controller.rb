class Api::TasksController < Api::BaseController
  include TaskProjectAccess

  before_action :set_task, only: [:update, :destroy]
  around_action :log_project_dashboard_exceptions

  # GET /tasks.json
  def index
    @tasks = Task.visible_to(current_user).includes(:developer, :assigned_user, :sprint)
                 .order(Arel.sql('tasks."order" ASC NULLS LAST'))
                 .order(id: :asc)

    @tasks = @tasks.where(assigned_to_user: params[:assigned_to_user]) if params[:assigned_to_user].present?
    @tasks = @tasks.where('sprint_id = ? OR type = ?', params[:sprint_id], 'general') if params[:sprint_id].present?
    @tasks = @tasks.where('project_id = ? OR type = ?', params[:project_id], 'general') if params[:project_id].present?
    @tasks = @tasks.where(type: params[:type]) if params[:type].present?

    render json: serialize_tasks(@tasks)
  end

  # POST /tasks.json
  def create
    @task = Task.new(authorize_task_attributes!(task_params))
    @task.created_by = current_user.id
    if @task.save
      render json: serialize_task(@task), status: :created
    else
      log_project_event(
        :error,
        'Task creation failed',
        payload: { task_id: @task.task_id, sprint_id: @task.sprint_id, project_id: @task.project_id, errors: @task.errors.full_messages }
      )
      render json: { errors: @task.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # PATCH/PUT /tasks/:id.json
  def update
    permitted_params = authorize_task_attributes!(task_params, task: @task)
    updated = Tasks::Updater.call(@task, permitted_params)

    if updated
      render json: serialize_task(@task)
    else
      log_project_event(
        :error,
        'Task update failed',
        payload: { task_id: @task.task_id, sprint_id: @task.sprint_id, project_id: @task.project_id, errors: @task.errors.full_messages }
      )
      render json: { errors: @task.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # DELETE /tasks/:id.json
  def destroy
    @task.destroy
    head :no_content
  end

  def import_backlog
    project = Project.accessible_to(current_user).find(params[:project_id]) if params[:project_id].present?
    project&.authorize_edit!(current_user)
    raise Project::Forbidden, 'Project management access is required.' unless project || current_user.owner? || current_user.admin?
    log_sheet_event(
      :info,
      'Backlog sheet import started',
      payload: { project_id: project&.id, sheet_name: 'Backlog', spreadsheet_id: project&.sheet_id }
    )
    service = TaskSheetService.new('Backlog', project&.sheet_id)
    service.import_tasks(sprint_id: nil, project_id: project&.id, created_by_id: current_user.id)
    log_sheet_event(
      :info,
      'Backlog sheet import completed',
      payload: { project_id: project&.id, sheet_name: 'Backlog', spreadsheet_id: project&.sheet_id }
    )
    head :no_content
  rescue ActiveRecord::RecordNotFound, Project::Forbidden
    raise
  rescue StandardError => e
    log_sheet_event(
      :error,
      'Backlog sheet import failed',
      exception: e,
      payload: { project_id: project&.id || params[:project_id], sheet_name: 'Backlog', spreadsheet_id: project&.sheet_id }
    )
    render json: { error: e.message }, status: :unprocessable_entity
  end

  private

  def set_task
    @task = Task.visible_to(current_user).find(params[:id])
    @task.authorize_edit!(current_user)
  end

  def task_params
    task_data = params.require(:task)
    task_data = task_data[:task] if task_data[:task].is_a?(ActionController::Parameters)

    permitted = task_data.permit(
      :task_id, :task_url, :type, :title, :description,
      :status, :order, :assigned_to_user,
      :start_date, :end_date,
      :estimated_hours, :sprint_id, :developer_id, :project_id, :is_struck,
      :qa_assigned, :internal_qa, :blocker, :demo, :swag_point, :story_point,
      :dev_hours, :code_review_hours, :dev_to_qa_hours, :qa_hours, :automation_qa_hours,
      :total_hours, :priority
    )

    # Tasks of type "general" should never be tied to a sprint or project.
    if permitted[:type] == 'general'
      permitted.delete(:sprint_id)
      permitted.delete(:project_id)
      return permitted
    end

    normalize_structured_task_attributes!(permitted)
    permitted
  end

  def normalize_structured_task_attributes!(permitted)
    developer_id = resolved_task_attribute(permitted, :developer_id, fallback: @task&.developer_id)
    qa_assigned = resolved_task_attribute(permitted, :qa_assigned, fallback: @task&.qa_assigned)

    normalized_type =
      if developer_id.present?
        'Code'
      elsif qa_assigned.present?
        'qa'
      else
        permitted[:type].presence || @task&.type
      end

    permitted[:type] = normalized_type if normalized_type.present?

    estimate_source =
      if normalized_type == 'qa'
        resolved_task_attribute(permitted, :qa_hours, fallback: @task&.qa_hours)
      else
        resolved_task_attribute(permitted, :dev_hours, fallback: @task&.dev_hours)
      end

    permitted[:estimated_hours] = estimate_source if estimate_source.present?
  end

  def resolved_task_attribute(permitted, key, fallback:)
    permitted.key?(key) ? permitted[key] : fallback
  end

  def serialize_tasks(tasks)
    tasks.as_json(include: serialization_includes)
  end

  def serialize_task(task)
    task.as_json(include: serialization_includes)
  end

  def serialization_includes
    {
      developer: { only: [:id, :first_name, :last_name, :email], methods: [:name] },
      assigned_user: { only: [:id, :first_name, :last_name, :email], methods: [:name] },
      sprint: { only: [:id, :project_id] }
    }
  end

end
