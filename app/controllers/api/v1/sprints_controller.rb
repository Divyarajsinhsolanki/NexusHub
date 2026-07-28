class Api::V1::SprintsController < Api::V1::BaseController
  def index
    project = Project.find(params[:project_id])
    sprints = project.sprints.includes(:tasks).order(start_date: :desc)
    render_paginated_data(sprints, serializer: method(:serialize_sprint))
  end
end
