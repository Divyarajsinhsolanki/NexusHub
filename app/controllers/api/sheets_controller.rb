class Api::SheetsController < Api::BaseController
  around_action :log_sheet_request_exceptions

  def show
    sheet_name = params[:sheet] || 'X2'
    project = Project.accessible_to(current_user).find(params[:project_id]) if params[:project_id].present?
    raise Project::Forbidden, 'Project access is required.' unless project || current_user.owner? || current_user.admin?
    log_sheet_event(
      :info,
      'Sheet data fetch started',
      payload: { project_id: project&.id, sheet_name: sheet_name, spreadsheet_id: project&.sheet_id }
    )
    reader = GoogleSheetsReader.new(sheet_name, project&.sheet_id)
    rows = reader.read_data
    log_sheet_event(
      :info,
      'Sheet data fetch completed',
      payload: { project_id: project&.id, sheet_name: sheet_name, spreadsheet_id: project&.sheet_id, row_count: rows.size }
    )
    render json: { rows: rows }
  rescue ActiveRecord::RecordNotFound, Project::Forbidden
    raise
  rescue StandardError => e
    log_sheet_event(
      :error,
      'Sheet data fetch failed',
      exception: e,
      payload: { project_id: project&.id || params[:project_id], sheet_name: sheet_name, spreadsheet_id: project&.sheet_id }
    )
    render json: { error: "An unexpected error occurred" }, status: :internal_server_error
  end
end
