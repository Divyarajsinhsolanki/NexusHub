class Api::V1::ProjectsController < Api::V1::BaseController
  def index
    projects = Project.includes(:sprints, :tasks, project_users: { user: { profile_picture_attachment: :blob } }).order(:name)
    render_paginated_data(projects, serializer: method(:serialize_project))
  end

  def show
    project = Project.includes(:sprints, :tasks, project_users: { user: { profile_picture_attachment: :blob } }).find(params[:id])
    render_data(serialize_project(project))
  end

  private

  def serialize_project(project)
    super.merge(
      sheet_integration_enabled: project.sheet_integration_enabled,
      sheet_id: project.sheet_id,
      issue_sheet_id: project.issue_sheet_id,
      issue_sheet_name: project.issue_sheet_name,
      qa_mode_enabled: project.try(:qa_mode_enabled) || false,
      users: project.project_users.map do |membership|
        user = membership.user
        {
          id: user.id,
          project_user_id: membership.id,
          name: user.full_name,
          email: user.email,
          job_title: user.job_title,
          avatar_color: user.avatar_color,
          profile_picture: attached_url(user.profile_picture),
          role: membership.role,
          status: membership.status,
          allocation_percentage: membership.allocation_percentage,
          workload_status: membership.workload_status
        }
      end
    )
  end
end
