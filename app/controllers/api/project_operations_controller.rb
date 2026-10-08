class Api::ProjectOperationsController < Api::BaseController
  before_action :set_project
  before_action :authorize_operations_read
  before_action :disable_storage

  rescue_from Operations::Error do |error|
    render json: { errors: [error.message] }, status: :unprocessable_entity
  end
  rescue_from Operations::Forbidden do |error|
    render json: { error: error.message }, status: :forbidden
  end
  rescue_from Operations::StaleRevision do |error|
    render json: { error: error.message, revision: @project.reload.operations_revision }, status: :conflict
  end
  rescue_from ActiveRecord::RecordInvalid do |error|
    render json: { errors: error.record.errors.full_messages }, status: :unprocessable_entity
  end
  rescue_from ActiveRecord::RecordNotUnique do
    render json: { errors: ["This item or environment entry already exists. Refresh and try again."] }, status: :unprocessable_entity
  end
  rescue_from ActiveRecord::RecordNotDestroyed do
    render json: { errors: ["This item is still referenced. Remove its links before deleting it."] }, status: :unprocessable_entity
  end

  def index
    render json: Operations::Snapshot.new(project: @project, user: current_user).call
  end

  def create
    render json: mutation.call(action: :create, attributes: item_params, reason: params[:reason]), status: :created
  end

  def update
    render json: mutation.call(action: :update, item: params[:id], attributes: item_params, reason: params[:reason])
  end

  def destroy
    render json: mutation.call(action: :destroy, item: params[:id], reason: params[:reason])
  end

  def update_entry
    render json: mutation.call(action: :update_entry, item: params[:id], environment: params[:environment_id], attributes: entry_params, reason: params[:reason])
  end

  def import_preview
    render json: imports.preview(format: params[:format], environment_id: params[:environment_id], content: params[:content], version_destination: params[:version_destination] || "observed")
  end

  def import_commit
    render json: imports.commit(
      format: params[:format], environment_id: params[:environment_id], content: params[:content],
      revision: params[:revision], selected_keys: params[:selected_keys], public_keys: params[:public_keys] || [], reason: params[:reason], version_destination: params[:version_destination] || "observed"
    )
  end

  def history
    render json: { history: Operations::Snapshot.new(project: @project, user: current_user).history(before_id: params[:before_id], limit: params[:limit] || 50) }
  end

  private

  def set_project
    @project = Project.find(params[:project_id])
  end

  def authorize_operations_read
    Operations::Policy.new(@project, current_user).authorize_read!
  end

  def disable_storage
    response.headers["Cache-Control"] = "no-store"
  end

  def mutation
    Operations::Mutation.new(project: @project, actor: current_user, revision: params[:revision])
  end

  def imports
    Operations::Imports.new(project: @project, actor: current_user)
  end

  def item_params
    raw = params.require(:item)
    raise Operations::Error, "Item must be an object." unless raw.is_a?(ActionController::Parameters)
    raw.permit(
      :kind, :name, :description, :category, :secret, :comparison, :license_key, :clear_license_key,
      details: {},
      entries: [:environment_id, :required, :value, :clear_value, :expected_version, :observed_version, :observed_at, :source, :verify_observation, { details: {} }]
    ).to_h
  end

  def entry_params
    raw = params.require(:entry)
    raise Operations::Error, "Entry must be an object." unless raw.is_a?(ActionController::Parameters)
    raw.permit(:required, :value, :clear_value, :expected_version, :observed_version, :observed_at, :source, :verify_observation, details: {}).to_h
  end
end
