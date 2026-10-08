class Api::TeamsController < Api::BaseController
  include Rails.application.routes.url_helpers
  include ActionView::Helpers::DateHelper

  before_action :set_team, only: [:update, :destroy, :insights]
  before_action :authorize_leader!, only: [:create, :update, :destroy]

  def index
    teams = Team.includes(team_users: :user).order(:name)
    render json: teams.map { |t| serialize_team(t) }
  end

  def create
    team = Team.new(team_params)
    team.owner ||= current_user
    if team.save
      render json: serialize_team(team), status: :created
    else
      render json: { errors: team.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @team.update(team_params)
      render json: serialize_team(@team)
    else
      render json: { errors: @team.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @team.destroy
    head :no_content
  end

  def insights
    render json: team_insights(@team)
  end

  private

  def set_team
    @team = Team.find(params[:id])
  end

  def team_params
    params.require(:team).permit(:name, :description)
  end

  def authorize_leader!
    allowed = current_user&.owner? || current_user&.team_leader?
    head :forbidden unless allowed
  end

  def serialize_team(team)
    {
      id: team.id,
      name: team.name,
      description: team.description,
      users: team.team_users.map do |tu|
        {
          id: tu.user_id,
          team_user_id: tu.id,
          name: [tu.user.first_name, tu.user.last_name].compact.join(' '),
          email: tu.user.email,
          profile_picture: tu.user.profile_picture.attached? ?
            rails_blob_url(tu.user.profile_picture, only_path: true) : nil,
          avatar_color: tu.user.avatar_color,
          role: tu.role,
          status: tu.status,
          job_title: tu.user.job_title,
          availability_status: tu.user.availability_status,
          availability_label: tu.user.availability_label,
          current_projects_count: tu.user.current_projects_count
        }
      end
    }
  end

  def team_insights(team)
    team_users = team.team_users.includes(user: [
      { user_skills: [:skill, :skill_endorsements] },
      { learning_goals: :learning_checkpoints },
      { profile_picture_attachment: :blob }
    ])

    members = team_users.map { |team_user| serialize_member(team_user) }
    skills = extract_skill_list(members)

    {
      team: { id: team.id, name: team.name },
      members: members,
      skills: skills,
      roles: members.map { |member| member[:job_title] }.compact.uniq.sort,
      skill_matrix: build_skill_matrix(skills, members),
      skill_gap: build_skill_gap(members),
      team_experts: team_experts(team_users),
      recent_endorsements: recent_endorsements(team),
      current_user_skills: serialize_user_skills(current_user.user_skills.includes(:skill).ordered_by_skill_name),
      current_user_learning_goals: serialize_learning_goals(current_user.learning_goals.where(team: team).includes(:learning_checkpoints).ordered),
      availability_options: availability_options,
      proficiency_levels: UserSkill::PROFICIENCY_LEVELS.map { |level| { value: level, label: level.titleize } },
      available_skills: Skill.alphabetical.map { |skill| { id: skill.id, name: skill.name } }
    }
  end

  def serialize_member(team_user)
    user = team_user.user
    {
      id: user.id,
      team_user_id: team_user.id,
      name: user.full_name.presence || user.email,
      email: user.email,
      job_title: user.job_title,
      role: team_user.role,
      role_label: team_user.role.to_s.humanize,
      availability_status: user.availability_status,
      availability_label: user.availability_label,
      current_projects_count: user.current_projects_count,
      avatar_color: user.avatar_color,
      profile_picture: profile_picture_url(user),
      skills: user.user_skills.map { |user_skill| serialize_member_skill(user_skill) }.sort_by { |skill| skill[:name] }
    }
  end

  def serialize_member_skill(user_skill)
    endorsement = user_skill.skill_endorsements.find { |se| se.endorser_id == current_user.id }
    {
      id: user_skill.id,
      skill_id: user_skill.skill_id,
      name: user_skill.skill.name,
      proficiency: user_skill.proficiency,
      proficiency_label: user_skill.proficiency_label,
      endorsements_count: user_skill.endorsements_count,
      endorsed_by_current_user: endorsement.present?,
      current_user_endorsement_id: endorsement&.id,
      last_endorsed_at: user_skill.last_endorsed_at
    }
  end

  def serialize_user_skills(user_skills)
    user_skills.map do |user_skill|
      {
        id: user_skill.id,
        skill_id: user_skill.skill_id,
        name: user_skill.skill.name,
        proficiency: user_skill.proficiency,
        proficiency_label: user_skill.proficiency_label,
        endorsements_count: user_skill.endorsements_count,
        last_endorsed_at: user_skill.last_endorsed_at
      }
    end
  end

  def serialize_learning_goals(goals)
    goals.map do |goal|
      {
        id: goal.id,
        title: goal.title,
        description: goal.description,
        due_date: goal.due_date&.to_s,
        days_remaining: goal.due_in_days,
        progress: goal.progress,
        checkpoints: goal.learning_checkpoints.order(:created_at).map do |checkpoint|
          {
            id: checkpoint.id,
            title: checkpoint.title,
            completed: checkpoint.completed,
            resource_url: checkpoint.resource_url
          }
        end
      }
    end
  end

  def build_skill_matrix(skills, members)
    levels = {}

    members.each do |member|
      levels[member[:id]] = {}
      member[:skills].each do |skill|
        levels[member[:id]][skill[:name]] = skill[:proficiency_label]
      end
    end

    {
      skills: skills.map { |skill| skill[:name] },
      levels: levels
    }
  end

  def build_skill_gap(members)
    metrics = Hash.new { |hash, key| hash[key] = Hash.new(0) }

    members.each do |member|
      member[:skills].each do |skill|
        metrics[skill[:name]][skill[:proficiency].to_sym] += 1
      end
    end

    summary = metrics.map do |skill_name, counts|
      {
        name: skill_name,
        expert_count: counts[:expert] || 0,
        advanced_count: counts[:advanced] || 0,
        intermediate_count: counts[:intermediate] || 0,
        beginner_count: counts[:beginner] || 0
      }
    end

    {
      strengths: summary.sort_by { |data| [-data[:expert_count], -data[:advanced_count], data[:name]] }.first(3),
      opportunities: summary.sort_by { |data| [data[:expert_count], data[:advanced_count], -data[:beginner_count], data[:name]] }.first(3)
    }
  end

  def team_experts(team_users)
    user_skills = team_users.flat_map { |team_user| team_user.user.user_skills }
    user_skills.sort_by { |user_skill| [-user_skill.endorsements_count, user_skill.skill.name] }
               .reject { |user_skill| user_skill.endorsements_count.zero? }
               .first(6)
               .map do |user_skill|
      {
        user_id: user_skill.user_id,
        name: user_skill.user.full_name.presence || user_skill.user.email,
        job_title: user_skill.user.job_title,
        skill_name: user_skill.skill.name,
        endorsements_count: user_skill.endorsements_count,
        avatar_color: user_skill.user.avatar_color,
        profile_picture: profile_picture_url(user_skill.user)
      }
    end
  end

  def recent_endorsements(team)
    scoped = SkillEndorsement.includes(:endorser, user_skill: [:skill, :user])
                              .where(team: team)
                              .order(created_at: :desc)
                              .limit(6)

    if scoped.blank?
      scoped = SkillEndorsement.includes(:endorser, user_skill: [:skill, :user])
                               .where(user_skills: { user_id: team.user_ids })
                               .order(created_at: :desc)
                               .limit(6)
    end

    scoped.map do |endorsement|
      {
        id: endorsement.id,
        skill_name: endorsement.user_skill.skill.name,
        created_at: endorsement.created_at,
        created_at_human: time_ago_in_words(endorsement.created_at),
        endorser: {
          id: endorsement.endorser_id,
          name: endorsement.endorser.full_name.presence || endorsement.endorser.email,
          avatar_color: endorsement.endorser.avatar_color,
          profile_picture: profile_picture_url(endorsement.endorser)
        },
        endorsee: {
          id: endorsement.user_skill.user_id,
          name: endorsement.user_skill.user.full_name.presence || endorsement.user_skill.user.email,
          avatar_color: endorsement.user_skill.user.avatar_color,
          profile_picture: profile_picture_url(endorsement.user_skill.user)
        }
      }
    end
  end

  def availability_options
    User.availability_statuses.keys.map do |value|
      { value: value, label: User::AVAILABILITY_LABELS[value] || value.to_s.humanize }
    end
  end

  def extract_skill_list(members)
    members.flat_map { |member| member[:skills] }
           .map { |skill| { id: skill[:skill_id], name: skill[:name] } }
           .uniq { |skill| skill[:id] }
           .sort_by { |skill| skill[:name] }
  end

  def profile_picture_url(user)
    return unless user.profile_picture.attached?

    rails_blob_url(user.profile_picture, only_path: true)
  end
end
