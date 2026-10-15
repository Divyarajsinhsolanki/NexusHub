class Api::WorkspaceMembershipsController < Api::BaseController
  before_action :authorize_management!, only: :update

  def index
    memberships = WorkspaceMembership.in_workspace(Current.workspace).includes(:user).order(:id)
    render json: memberships.map { |membership| serialize_membership(membership) }
  end

  def update
    membership = WorkspaceMembership.in_workspace(Current.workspace).find(params[:id])
    attributes = params.require(:workspace_membership).permit(:status, role_names: [])
    WorkspaceMemberManagement.update!(membership, **attributes.to_h.symbolize_keys)
    render json: serialize_membership(membership)
  rescue ActiveRecord::RecordInvalid => error
    render json: { errors: error.record.errors.full_messages }, status: :unprocessable_entity
  end

  private

  def authorize_management!
    head :forbidden unless WorkspaceAuthorization.allowed?(current_user, "memberships.manage")
  end

  def serialize_membership(membership)
    { id: membership.id, user_id: membership.user_id, workspace_id: membership.workspace_id,
      name: membership.user.full_name, status: membership.status, roles: membership.role_names }
  end
end
