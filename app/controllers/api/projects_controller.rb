class Api::ProjectsController < Api::BaseController
  include Rails.application.routes.url_helpers
  PROJECT_USER_INCLUDES = { user: [:department, { profile_picture_attachment: :blob }] }.freeze

  before_action :set_project, only: [:show, :update, :destroy]
  before_action :authorize_manager!, only: [:create]
  around_action :log_project_dashboard_exceptions

  def index
    projects = Project.accessible_to(current_user).includes(project_users: PROJECT_USER_INCLUDES).order(:name)
    render_paginated_collection(projects, serializer: method(:serialize_project))
  end

  def show
    render json: serialize_project(@project)
  end

  def create
    project = Project.new(project_params)
    project.owner ||= current_user
    save_project_with_members(project, status: :created)
  end

  def update
    @project.assign_attributes(project_params)
    save_project_with_members(@project)
  end

  def destroy
    @project.destroy
    head :no_content
  end

  private

  def set_project
    @project = Project.accessible_to(current_user).find(params[:id])
    @project.authorize_management!(current_user) unless action_name == "show"
  end

  def project_params
    params.require(:project).permit(
      :name,
      :description,
      :start_date,
      :end_date,
      :sheet_integration_enabled,
      :sheet_id,
      :issue_sheet_id,
      :issue_sheet_name,
      :qa_mode_enabled
    )
  end

  def member_assignments_param
    raw_assignments = params.dig(:project, :member_assignments)
    return nil unless raw_assignments

    Array(raw_assignments).filter_map do |assignment|
      permitted = assignment.respond_to?(:permit) ? assignment.permit(:user_id, :role, :allocation_percentage, :workload_status) : assignment
      next if permitted[:user_id].blank?

      {
        user_id: permitted[:user_id].to_i,
        role: permitted[:role].presence || 'collaborator',
        allocation_percentage: permitted[:allocation_percentage].presence || 0,
        workload_status: permitted[:workload_status].presence || 'partial'
      }
    end.uniq { |assignment| assignment[:user_id] }
  end

  def save_project_with_members(project, status: :ok)
    Project.transaction do
      project.save!
      sync_project_members!(project)
    end

    render json: serialize_project(project.reload), status: status
  rescue ActiveRecord::RecordInvalid => e
    errors = project.errors.full_messages.presence || [e.record.errors.full_messages.presence || e.message].flatten
    log_project_event(
      :error,
      'Project save failed',
      payload: {
        project_id: project.id,
        project_name: project.name,
        errors: errors.flatten.uniq,
        member_assignments_count: Array(member_assignments_param).size
      }
    )
    render json: { errors: errors.flatten.uniq }, status: :unprocessable_entity
  end

  def sync_project_members!(project)
    assignments = member_assignments_param
    return if assignments.nil?

    existing_project_users = project.project_users.index_by(&:user_id)
    incoming_user_ids = assignments.map { |assignment| assignment[:user_id] }

    assignments.each do |assignment|
      project_user = existing_project_users.delete(assignment[:user_id]) || project.project_users.build(user_id: assignment[:user_id])
      project_user.assign_attributes(
        role: assignment[:role],
        allocation_percentage: assignment[:allocation_percentage],
        workload_status: assignment[:workload_status],
        status: project_user.status.presence || 'active'
      )
      project_user.save!
    end

    project.project_users.where.not(user_id: incoming_user_ids).destroy_all
  end

  def authorize_manager!
    return if @project&.manageable_by?(current_user)
    allowed = current_user&.owner? || current_user&.admin? || current_user&.project_manager?
    return if allowed

    log_project_event(:warn, 'Project management authorization failed')
    head :forbidden
  end

  def serialize_project(project)
    {
      id: project.id,
      owner_id: project.owner_id,
      can_access: Project.accessible_to(current_user).exists?(id: project.id),
      can_edit: project.editable_by?(current_user),
      can_manage: project.manageable_by?(current_user),
      can_operate: Operations::Policy.new(project, current_user).edit?,
      name: project.name,
      description: project.description,
      start_date: project.start_date,
      end_date: project.end_date,
      status: project.status,
      sheet_integration_enabled: project.sheet_integration_enabled,
      sheet_id: project.sheet_id,
      issue_sheet_id: project.issue_sheet_id,
      issue_sheet_name: project.issue_sheet_name,
      qa_mode_enabled: project.try(:qa_mode_enabled) || false,
      users: project_users_for(project).sort_by { |pu| [pu.role.to_s, pu.user&.full_name.to_s] }.map do |pu|
        {
          id: pu.user_id,
          project_user_id: pu.id,
          name: [pu.user.first_name, pu.user.last_name].compact.join(' '),
          profile_picture: pu.user.profile_picture.attached? ?
            rails_blob_url(pu.user.profile_picture, only_path: true) : nil,
          avatar_color: pu.user.avatar_color,
          email: pu.user.email,
          department_name: pu.user.department&.name,
          availability_status: pu.user.availability_status,
          phone_number: pu.user.phone_number,
          job_title: pu.user.job_title,
          bio: pu.user.bio,
          social_links: pu.user.social_links || {},
          role: pu.role,
          status: pu.status,
          allocation_percentage: pu.allocation_percentage,
          workload_status: pu.workload_status
        }
      end
    }
  end

  def project_users_for(project)
    return project.project_users if project.association(:project_users).loaded?

    project.project_users.includes(PROJECT_USER_INCLUDES)
  end
end
