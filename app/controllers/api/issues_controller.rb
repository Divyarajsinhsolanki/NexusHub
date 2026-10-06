class Api::IssuesController < Api::BaseController
  include Rails.application.routes.url_helpers
  before_action :require_project_id!
  before_action :authorize_project!
  before_action :set_issue, only: [:update, :destroy]
  around_action :log_project_dashboard_exceptions

  def index
    issues = @project.issues.includes(:reporter, :assignee_user)
                  .order(created_at: :desc)
    render json: issues.map { |i| serialize_issue(i) }
  end

  def create
    issue = Issue.new(issue_params.merge(project_id: @project_id))
    attach_media(issue)
    if issue.save
      render json: serialize_issue(issue), status: :created
    else
      log_project_event(
        :error,
        'Issue creation failed',
        payload: { project_id: @project_id, issue_key: issue.issue_key, title: issue.title, errors: issue.errors.full_messages }
      )
      render json: { errors: issue.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    attach_media(@issue)
    if @issue.update(issue_params.merge(project_id: @project_id))
      render json: serialize_issue(@issue)
    else
      log_project_event(
        :error,
        'Issue update failed',
        payload: { project_id: @project_id, issue_id: @issue.id, issue_key: @issue.issue_key, errors: @issue.errors.full_messages }
      )
      render json: { errors: @issue.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @issue.destroy
    head :no_content
  end

  def import_from_sheet
    project = @project
    unless project.sheet_integration_enabled?
      log_sheet_event(:warn, 'Issue sheet import blocked: integration disabled', payload: { project_id: project.id })
      return render json: { error: "Sheet integration is disabled for this project" }, status: :unprocessable_entity
    end

    spreadsheet_id = project.issue_sheet_id.presence || project.sheet_id
    sheet_name = params[:sheet].presence || project.issue_sheet_name.presence || "Issue Tracker"
    if spreadsheet_id.blank?
      log_sheet_event(:error, 'Issue sheet import blocked: spreadsheet ID missing', payload: { project_id: project.id, sheet_name: sheet_name })
      return render json: { error: "Issue tracker Sheet ID missing for this project" }, status: :unprocessable_entity
    end

    log_sheet_event(
      :info,
      'Issue sheet import started',
      payload: { project_id: project.id, sheet_name: sheet_name, spreadsheet_id: spreadsheet_id }
    )

    summary = IssueSheetImportService.new(
      project: project,
      sheet_name: sheet_name,
      spreadsheet_id: spreadsheet_id
    ).call

    log_sheet_event(
      :info,
      'Issue sheet import completed',
      payload: { project_id: project.id, sheet_name: sheet_name, spreadsheet_id: spreadsheet_id, summary: summary }
    )

    render json: summary.merge(sheet_name: sheet_name)
  rescue StandardError => e
    log_sheet_event(
      :error,
      'Issue sheet import failed',
      exception: e,
      payload: { project_id: @project_id, sheet_name: sheet_name, spreadsheet_id: spreadsheet_id }
    )
    render json: { error: "Issue import failed. Please check the sheet configuration and try again." }, status: :unprocessable_entity
  end

  private

  def authorize_project!
    @project = Project.accessible_to(current_user).find(@project_id)
  end

  def set_issue
    @issue = Issue.find_by!(id: params[:id], project_id: @project_id)
  end

  def issue_params
    params.require(:issue).permit(
      :project_id, :issue_key, :title, :status, :severity, :category, :module_name,
      :sub_module, :sprint_name, :task_id, :found_by, :found_on, :issue_description,
      :pre_conditions, :repro_steps, :actual_result, :expected_result, :attachment, :comment,
      :owner, :owner_email, :assignee, :assignee_email, :assignee_slack, :due_date,
      :section_detail, :mf6_app, :local_qa, :team_test, :comment_qa,
      :dev_comments_dated, :developer_comment, :issue_present_in_rails4,
      :reporter_id, :assignee_user_id,
      media_urls: [], attachment_urls: []
    )
  end

  def require_project_id!
    @project_id = params[:project_id] || params.dig(:issue, :project_id)
    unless @project_id.present?
      render json: { error: "project_id required" }, status: :unprocessable_entity
    end
  end

  def attach_media(issue)
    files = params.dig(:issue, :media_files)
    return unless files.present?
    Array(files).each do |file|
      issue.media_files.attach(file)
    end
  end

  def serialize_issue(issue)
    media_urls = issue.media_files.map { |f| url_for(f) }
    issue.as_json.symbolize_keys.merge(
      media_files: media_urls,
      media_urls: issue.media_urls || [],
      attachment_urls: issue.attachment_urls || [],
      reporter_name: issue.reporter&.full_name,
      assignee_user_name: issue.assignee_user&.full_name
    )
  end
end
