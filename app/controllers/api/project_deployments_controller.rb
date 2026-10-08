class Api::ProjectDeploymentsController < Api::BaseController
  before_action :set_project
  after_action :disable_caching
  rescue_from Operations::Error do |error|
    render json: { error: error.message }, status: :unprocessable_entity
  end
  rescue_from Operations::Forbidden do |error|
    render json: { error: error.message }, status: :forbidden
  end
  rescue_from Operations::StaleRevision do |error|
    render json: { error: error.message, revision: @project.reload.operations_revision }, status: :conflict
  end
  rescue_from ActiveRecord::RecordInvalid do |error|
    render json: { errors: error.record.errors.full_messages }, status: :unprocessable_entity
  end

  def index
    Operations::Policy.new(@project, current_user).authorize_read!
    @project.with_lock { render json: Operations::Schedules.snapshot(@project).merge(revision: @project.operations_revision) }
  end

  def create
    mutate('deployment_created', status: :created) do
      attrs = deployment_params.to_h
      attrs['owner_id'] ||= current_user.id
      attrs['targets'] = Operations::DeploymentWorkflow.prepare_targets(@project, attrs['project_environment_id'], attrs['targets'])
      deployment = ProjectDeployment.create!(attrs.merge(project: @project, workspace: @project.workspace))
      Operations::Schedules.sync_deployment!(deployment)
      deployment
    end
  end

  def update
    mutate('deployment_updated') do
      deployment = find_deployment
      raise Operations::Error, 'Only planned deployments can be edited' unless deployment.status == 'planned'
      attrs = deployment_params.to_h
      attrs['targets'] = Operations::DeploymentWorkflow.prepare_targets(@project, attrs['project_environment_id'] || deployment.project_environment_id, attrs['targets']) if attrs.key?('targets')
      deployment.update!(attrs.merge(schedule_revision: deployment.schedule_revision + 1))
      Operations::Schedules.sync_deployment!(deployment)
      deployment
    end
  end

  def destroy
    mutate('deployment_cancelled') { Operations::DeploymentWorkflow.transition!(find_deployment, 'cancelled') }
  end

  def transition
    mutate('deployment_status_changed') { Operations::DeploymentWorkflow.transition!(find_deployment, params.require(:status)) }
  end

  def observations
    if ActiveModel::Type::Boolean.new.cast(params[:preview])
      Operations::Policy.new(@project, current_user).authorize_edit!
      @project.with_lock do
        deployment = find_deployment
        rows = Operations::DeploymentWorkflow.parse_observation_csv(deployment, params[:content])
        render json: { rows: rows, revision: @project.operations_revision }
      end
      return
    end
    mutate('deployment_observations_recorded') do
      deployment = find_deployment
      if params.key?(:content)
        rows = Operations::DeploymentWorkflow.parse_observation_csv(deployment, params[:content])
        selected = params[:selected_item_ids]
        unless selected.is_a?(Array) && selected.any? && selected.all? { |id| id.to_s.match?(/\A[1-9]\d*\z/) } && (selected.map(&:to_i) - rows.map { |row| row['item_id'] }).empty?
          raise Operations::Error, 'Select one or more components from the preview'
        end
        rows.select! { |row| selected.map(&:to_i).include?(row['item_id']) }
      else
        rows = params.permit(observations: %i[item_id observed_version source])[:observations]&.map(&:to_h)
      end
      Operations::DeploymentWorkflow.observe!(deployment, rows)
    end
  end

  def verify
    mutate('deployment_verified') { Operations::DeploymentWorkflow.verify!(find_deployment, actor: current_user) }
  end

  def create_series
    mutate('deployment_series_created', status: :created) do
      attrs = series_params.to_h
      attrs['owner_id'] ||= current_user.id
      attrs['targets'] = Operations::DeploymentWorkflow.prepare_targets(@project, attrs['project_environment_id'], attrs['targets'])
      series = ProjectDeploymentSeries.create!(attrs.merge(project: @project, workspace: @project.workspace))
      Operations::Schedules.materialize!(series)
      series
    end
  end

  def update_series
    mutate('deployment_series_updated') do
      series = find_series
      raise Operations::Error, 'Cancelled schedules cannot be changed' unless series.active?
      attrs = series_params.to_h
      attrs['targets'] = Operations::DeploymentWorkflow.prepare_targets(@project, attrs['project_environment_id'] || series.project_environment_id, attrs['targets']) if attrs.key?('targets')
      series.update!(attrs)
      desired = Operations::Recurrence.occurrences(series).to_h
      series.project_deployments.where(status: 'planned').where('scheduled_at >= ?', Time.current).find_each do |deployment|
        if desired.key?(deployment.occurrence_key)
          deployment.update!(series.attributes.slice('project_environment_id', 'owner_id', 'name', 'time_zone', 'recipient_ids', 'reminder_minutes', 'targets', 'notes').merge(scheduled_at: desired[deployment.occurrence_key], schedule_revision: deployment.schedule_revision + 1))
          Operations::Schedules.sync_deployment!(deployment)
        else
          Operations::DeploymentWorkflow.transition!(deployment, 'cancelled')
          # Keep the cancelled record as history, but release this series date.
          # A later series edit may schedule it again. Explicit occurrence
          # cancellations retain their keys so materialization skips them.
          deployment.update!(occurrence_key: nil)
        end
      end
      Operations::Schedules.materialize!(series)
      series
    end
  end

  def destroy_series
    mutate('deployment_series_cancelled') do
      series = find_series
      series.update!(active: false)
      series.project_deployments.where(status: 'planned').where('scheduled_at >= ?', Time.current).find_each do |deployment|
        Operations::DeploymentWorkflow.transition!(deployment, 'cancelled')
      end
      series
    end
  end

  private

  def set_project
    @project = Project.find(params[:project_id])
  end

  def find_deployment
    ProjectDeployment.where(project: @project).find(params[:id])
  end

  def find_series
    ProjectDeploymentSeries.where(project: @project).find(params[:id])
  end

  def mutate(event, status: :ok)
    result = Operations::Mutation.new(project: @project, actor: current_user, revision: params[:revision]).run(event: event, reason: params[:reason]) do |mutation|
      record = yield
      key = record.is_a?(ProjectDeployment) ? :deployment_id : :series_id
      mutation.audit!(action: event, item_name: record.name, environment: record.project_environment, fields: ['schedule'], metadata: { key => record.id })
      Operations::Schedules.snapshot(@project)
    end
    render json: result, status: status
  end

  def disable_caching
    response.headers['Cache-Control'] = 'no-store'
  end

  def deployment_params
    params.require(:deployment).permit(:name, :project_environment_id, :scheduled_at, :time_zone, :owner_id, :notes,
      recipient_ids: [], reminder_minutes: [], targets: %i[item_id expected_version])
  end

  def series_params
    params.require(:series).permit(:name, :project_environment_id, :time_zone, :owner_id, :notes, :frequency, :local_time,
      :starts_on, :ends_on, :day_of_month, weekdays: [], recipient_ids: [], reminder_minutes: [], targets: %i[item_id expected_version])
  end
end
