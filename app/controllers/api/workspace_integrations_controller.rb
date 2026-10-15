class Api::WorkspaceIntegrationsController < Api::BaseController
  before_action :authorize_connection_management!

  def index
    connections = WorkspaceIntegration.in_workspace(current_user.workspace).index_by(&:provider)
    render json: WorkspaceIntegration::PROVIDERS.map { |provider| connections[provider]&.public_payload || { provider:, configured: false, settings: {} } }
  end

  def update
    provider = params.require(:provider).to_s
    raise ArgumentError, "Unsupported integration provider." unless WorkspaceIntegration::PROVIDERS.include?(provider)
    current_user.workspace.with_lock do
      authorize_connection_management!
      connection = WorkspaceIntegration.in_workspace(current_user.workspace).find_or_initialize_by(provider:)
      connection.workspace = current_user.workspace
      connection.replace_secret!(params.require(:integration).require(:credential))
      audit!("integration.updated", provider)
      render json: connection.public_payload
    end
  rescue ArgumentError, ActionController::ParameterMissing => error
    render json: { error: error.message }, status: :unprocessable_entity
  end

  def destroy
    connection = WorkspaceIntegration.in_workspace(current_user.workspace).find_by!(provider: params[:provider])
    current_user.workspace.with_lock do
      authorize_connection_management!
      connection.revoke!
      audit!("integration.revoked", connection.provider)
    end
    head :no_content
  end

  private

  def authorize_connection_management!
    current_user.reload
    return if WorkspaceAuthorization.allowed?(current_user, "integrations.manage")
    raise Project::Forbidden, "Workspace integration management access is required."
  end

  def audit!(action, provider)
    WorkspaceAccessEvent.create!(workspace: current_user.workspace, actor: current_user, action:, details: { provider: })
  end
end
