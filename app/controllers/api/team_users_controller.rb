class Api::TeamUsersController < Api::BaseController
  before_action :authorize_admin!, except: [:leave]
  before_action :authorize_leader!, only: [:leave]
  before_action :set_team_user, only: [:update, :destroy]

  def create
    team = Team.find(params.dig(:team_user, :team_id))
    user = current_user.workspace.users.find(params.dig(:team_user, :user_id))
    team_user = team.team_users.new(team_user_attributes.merge(user: user))
    if team_user.save
      render json: serialize_team_user(team_user), status: :created
    else
      render json: { errors: team_user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @team_user.update(team_user_attributes)
      render json: serialize_team_user(@team_user)
    else
      render json: { errors: @team_user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @team_user.destroy
    head :no_content
  end

  def leave
    team_user = TeamUser.find_by(team_id: params[:team_id], user_id: current_user.id)
    return head :not_found unless team_user

    team_user.destroy
    head :no_content
  end

  private

  def authorize_admin!
    head :forbidden unless current_user&.admin? || current_user&.owner?
  end

  def authorize_leader!
    head :forbidden unless current_user&.team_leader?
  end

  def set_team_user
    @team_user = TeamUser.find(params[:id])
  end

  def team_user_attributes
    raw = params.require(:team_user)
    attributes = {}
    attributes[:role] = raw[:role] if TeamUser.roles.key?(raw[:role])
    attributes[:status] = raw[:status] if TeamUser.statuses.key?(raw[:status])
    attributes
  end

  def serialize_team_user(tu)
    {
      id: tu.id,
      team_id: tu.team_id,
      user_id: tu.user_id,
      role: tu.role,
      status: tu.status
    }
  end
end
