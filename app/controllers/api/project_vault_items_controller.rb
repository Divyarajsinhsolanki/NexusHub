class Api::ProjectVaultItemsController < Api::BaseController
  before_action :set_project
  before_action :set_vault_item, only: [:update, :destroy]
  before_action :authorize_project_member
  around_action :log_project_dashboard_exceptions

  def index
    scope = @project.project_vault_items.includes(:project_environment)
    filtered_items = apply_filters(scope)

    render json: {
      items: filtered_items.as_json(include: { project_environment: { only: [:id, :name] } }),
      filters: {
        categories: available_categories(scope),
        environments: @project.project_environments.order(:name).as_json(only: [:id, :name])
      }
    }
  end

  def create
    vault_item = @project.project_vault_items.build(vault_item_params)
    if vault_item.save
      render json: vault_item.as_json(include: { project_environment: { only: [:id, :name] } }), status: :created
    else
      log_project_event(
        :error,
        'Project vault item creation failed',
        payload: { project_id: @project.id, title: vault_item.title, category: vault_item.category, errors: vault_item.errors.full_messages }
      )
      render json: { errors: vault_item.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @vault_item.update(vault_item_params)
      render json: @vault_item.as_json(include: { project_environment: { only: [:id, :name] } })
    else
      log_project_event(
        :error,
        'Project vault item update failed',
        payload: { project_id: @project.id, vault_item_id: @vault_item.id, title: @vault_item.title, errors: @vault_item.errors.full_messages }
      )
      render json: { errors: @vault_item.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @vault_item.destroy
    head :no_content
  end

  private

  def set_project
    @project = Project.find(params[:project_id])
  end

  def set_vault_item
    @vault_item = @project.project_vault_items.find(params[:id])
  end

  def authorize_project_member
    Project.accessible_to(current_user).find(@project.id)
    @project.authorize_edit!(current_user) unless request.get? || request.head?
  end

  def vault_item_params
    params.require(:project_vault_item).permit(:title, :category, :content, :username, :project_environment_id, metadata: {})
  end

  def apply_filters(scope)
    items = scope

    if params[:q].present?
      query = "%#{params[:q]}%"
      items = items.where("title ILIKE :query OR content ILIKE :query", query: query)
    end

    if params[:category].present?
      items = items.where(category: params[:category])
    end

    if params[:environment_id].present?
      if params[:environment_id] == 'global'
        items = items.where(project_environment_id: nil)
      else
        items = items.where(project_environment_id: params[:environment_id])
      end
    end

    apply_sort(items)
  end

  def apply_sort(scope)
    case params[:sort]
    when "title_asc"
      scope.order(Arel.sql("LOWER(title) ASC"))
    when "title_desc"
      scope.order(Arel.sql("LOWER(title) DESC"))
    when "oldest"
      scope.order(:created_at)
    else
      scope.order(created_at: :desc)
    end
  end

  def available_categories(scope)
    scope.distinct.where.not(category: [nil, ""]).order(:category).pluck(:category)
  end
end
