class Api::ProjectEnvironmentsController < Api::BaseController
  before_action :set_project
  before_action :set_environment, only: %i[update destroy]

  rescue_from Operations::Error, ActiveRecord::RecordInvalid, ActiveRecord::RecordNotDestroyed do |error|
    message = error.is_a?(Operations::Error) ? error.message : 'The environment could not be saved. Check its name and references.'
    render json: { error: message }, status: :unprocessable_entity
  end
  rescue_from Operations::Forbidden do
    render json: { error: 'Not authorized' }, status: :forbidden
  end
  rescue_from Operations::StaleRevision do
    render json: { error: 'This project changed. Refresh before saving.' }, status: :conflict
  end

  def index
    render json: @project.project_environments.order(:name)
  end

  def create
    render json: mutate('create')[:environment], status: :created
  end

  def update
    render json: mutate('update')[:environment]
  end

  def destroy
    mutate('delete')
    head :no_content
  end

  private

  def set_project
    @project = Project.find(params[:project_id])
    Operations::Policy.new(@project, current_user).authorize_read!
  end

  def set_environment
    @environment = @project.project_environments.find(params[:id])
  end

  def mutate(action)
    Operations::Environments.call(
      project: @project, actor: current_user, action: action,
      environment: @environment, revision: params[:revision], reason: params[:reason],
      attributes: action == 'delete' ? {} : params.require(:project_environment).permit(:name, :url, :description).to_h.symbolize_keys
    )
  end
end
