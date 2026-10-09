class Api::LearningGoalsController < Api::BaseController
  before_action :set_learning_goal, only: [:update, :destroy]

  def index
    goals = current_user.learning_goals.includes(:learning_checkpoints).ordered
    goals = goals.where(team_id: params[:team_id]) if params[:team_id].present?
    render json: goals.map { |goal| serialize(goal) }
  end

  def create
    goal = current_user.learning_goals.build(learning_goal_params)

    if goal.team_id.present? && !current_user.team_users.exists?(team_id: goal.team_id, status: 'accepted')
      return render json: { errors: ["You must be a member of this team to create a goal."] }, status: :forbidden
    end

    LearningGoal.transaction do
      goal.save!
      create_checkpoints(goal)
    end
    render json: serialize(goal), status: :created
  rescue ActiveRecord::RecordInvalid => error
    render json: { errors: error.record.errors.full_messages }, status: :unprocessable_entity
  end

  def update
    team_id = learning_goal_params[:team_id]
    if team_id.present? && !current_user.team_users.exists?(team_id: team_id, status: 'accepted')
      return render json: { errors: ['You must be a member of this team to create a goal.'] }, status: :forbidden
    end
    if @learning_goal.update(learning_goal_params)
      render json: serialize(@learning_goal)
    else
      render json: { errors: @learning_goal.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @learning_goal.destroy
    head :no_content
  end

  private

  def learning_goal_params
    params.require(:learning_goal).permit(:title, :due_date, :description, :team_id)
  end

  def checkpoint_params
    params.fetch(:learning_goal, {}).permit(checkpoints: [:title, :resource_url])[:checkpoints]
  end

  def set_learning_goal
    @learning_goal = current_user.learning_goals.find(params[:id])
  end

  def create_checkpoints(goal)
    checkpoints = checkpoint_params
    return if checkpoints.blank?

    checkpoints.each do |checkpoint|
      goal.learning_checkpoints.create!(checkpoint)
    end
    goal.recalculate_progress!
  end

  def serialize(goal)
    {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      due_date: goal.due_date&.to_s,
      progress: goal.progress,
      team_id: goal.team_id,
      days_remaining: goal.due_in_days,
      checkpoints: goal.learning_checkpoints.order(:created_at).map do |checkpoint|
        serialize_checkpoint(checkpoint)
      end
    }
  end

  def serialize_checkpoint(checkpoint)
    {
      id: checkpoint.id,
      title: checkpoint.title,
      completed: checkpoint.completed,
      resource_url: checkpoint.resource_url
    }
  end
end
