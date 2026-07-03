class Api::SearchController < Api::BaseController
  DEFAULT_TYPES = %w[projects tasks issues users posts knowledge pdf_documents].freeze
  MAX_PER_TYPE = 6

  def index
    query = params[:q].to_s.strip
    return render json: { query: query, results: [] } if query.length < 2

    requested_types = Array(params[:types].presence || DEFAULT_TYPES)
      .flat_map { |value| value.to_s.split(",") }
      .intersection(DEFAULT_TYPES)
    pattern = "%#{ActiveRecord::Base.sanitize_sql_like(query)}%"

    results = requested_types.flat_map { |type| send("search_#{type}", pattern) }
      .sort_by { |item| item[:updated_at] || Time.at(0) }
      .reverse

    render json: { query: query, results: results.first(30) }
  end

  private

  def search_projects(pattern)
    Project.where("name ILIKE ? OR description ILIKE ?", pattern, pattern)
      .order(updated_at: :desc)
      .limit(MAX_PER_TYPE)
      .map do |project|
        result("project", project.id, project.name, project.description, "/projects/#{project.id}/dashboard", project.updated_at)
      end
  end

  def search_tasks(pattern)
    Task.where("title ILIKE ? OR task_id ILIKE ? OR description ILIKE ?", pattern, pattern, pattern)
      .where(
        "type != :general OR created_by = :user_id OR assigned_to_user = :user_id",
        general: "general",
        user_id: current_user.id
      )
      .includes(:project)
      .order(updated_at: :desc)
      .limit(MAX_PER_TYPE)
      .map do |task|
        title = task.title.presence || task.task_id
        path = task.project_id ? "/projects/#{task.project_id}/dashboard?task_id=#{task.id}" : "/momentum"
        result("task", task.id, title, task.project&.name || task.status, path, task.updated_at)
      end
  end

  def search_issues(pattern)
    Issue.where("title ILIKE ? OR issue_key ILIKE ? OR issue_description ILIKE ?", pattern, pattern, pattern)
      .includes(:project)
      .order(updated_at: :desc)
      .limit(MAX_PER_TYPE)
      .map do |issue|
        result("issue", issue.id, "#{issue.issue_key}: #{issue.title}", issue.project&.name, "/projects/#{issue.project_id}/issues?issue_id=#{issue.id}", issue.updated_at)
      end
  end

  def search_users(pattern)
    current_user.workspace.users
      .where("first_name ILIKE ? OR last_name ILIKE ? OR email ILIKE ? OR job_title ILIKE ?", pattern, pattern, pattern, pattern)
      .order(updated_at: :desc)
      .limit(MAX_PER_TYPE)
      .map do |user|
        result("user", user.id, user.full_name, user.job_title, "/profile/#{user.id}", user.updated_at)
      end
  end

  def search_posts(pattern)
    Post.where("message ILIKE ?", pattern)
      .includes(:user)
      .order(updated_at: :desc)
      .limit(MAX_PER_TYPE)
      .map do |post|
        result("post", post.id, post.message.to_s.truncate(80), post.user&.full_name, "/posts#post-#{post.id}", post.updated_at)
      end
  end

  def search_knowledge(pattern)
    current_user.knowledge_bookmarks
      .where("payload::text ILIKE ? OR collection_name ILIKE ?", pattern, pattern)
      .order(updated_at: :desc)
      .limit(MAX_PER_TYPE)
      .map do |bookmark|
        title = bookmark.payload["title"] || bookmark.payload["headline"] || bookmark.card_type.humanize
        result("knowledge", bookmark.id, title, bookmark.collection_name, "/knowledge?bookmark_id=#{bookmark.id}", bookmark.updated_at)
      end
  end

  def search_pdf_documents(pattern)
    current_user.pdf_documents
      .where("title ILIKE :pattern OR original_filename ILIKE :pattern OR searchable_text ILIKE :pattern", pattern:)
      .order(updated_at: :desc)
      .limit(MAX_PER_TYPE)
      .map do |document|
        result("pdf_document", document.id, document.title, document.original_filename, "/pdf-master?document_id=#{document.id}", document.updated_at)
      end
  end

  def result(type, id, title, subtitle, path, updated_at)
    {
      type: type,
      id: id,
      title: title,
      subtitle: subtitle.to_s.truncate(120),
      path: path,
      updated_at: updated_at
    }
  end
end
