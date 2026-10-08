class Api::ProjectUsersController < Api::BaseController
  before_action :set_project_user, only: [:update, :destroy]
  before_action :authorize_member_management!, only: [:create, :update, :destroy]
  before_action :authorize_manager!, only: [:leave]

  def create
    project = Project.accessible_to(current_user).find(params.dig(:project_user, :project_id))
    user = current_user.workspace.users.find(params.dig(:project_user, :user_id))
    project_user = project.project_users.new(project_user_attributes.merge(user: user))
    if project_user.save
      render json: serialize_project_user(project_user), status: :created
    else
      render json: { errors: project_user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @project_user.update(project_user_attributes)
      render json: serialize_project_user(@project_user)
    else
      render json: { errors: @project_user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @project_user.destroy
    head :no_content
  end

  def leave
    project_user = ProjectUser.find_by(project_id: params[:project_id], user_id: current_user.id)
    return head :not_found unless project_user

    project_user.destroy
    head :no_content
  end

  private

  def authorize_member_management!
    project = @project_user&.project || Project.accessible_to(current_user).find(params.dig(:project_user, :project_id))
    project.authorize_management!(current_user)
  end

  def authorize_manager!
    head :forbidden unless current_user&.project_manager?
  end

  def set_project_user
    @project_user = ProjectUser.find(params[:id])
  end

  def project_user_attributes
    raw = params.require(:project_user)
    attributes = {}
    attributes[:role] = raw[:role] if ProjectUser.roles.key?(raw[:role])
    attributes[:status] = raw[:status] if ProjectUser.statuses.key?(raw[:status])
    attributes[:allocation_percentage] = raw[:allocation_percentage].to_i if raw[:allocation_percentage].present?
    attributes[:workload_status] = raw[:workload_status] if ProjectUser::WORKLOAD_STATUSES.include?(raw[:workload_status])
    attributes
  end

  def serialize_project_user(pu)
    {
      id: pu.id,
      project_id: pu.project_id,
      user_id: pu.user_id,
      role: pu.role,
      status: pu.status,
      allocation_percentage: pu.allocation_percentage,
      workload_status: pu.workload_status
    }
  end
end
