class Api::WorkspaceOffboardingsController < Api::BaseController
  before_action :set_membership
  rescue_from WorkspaceOffboarding::InvalidRequest do |error|
    render json: { errors: [error.message] }, status: :unprocessable_entity
  end
  rescue_from ActiveRecord::RecordInvalid do |error|
    render json: { errors: error.record.errors.full_messages }, status: :unprocessable_entity
  end

  def preview
    render json: WorkspaceOffboarding.preview(@membership, actor: current_user)
  end

  def create
    attributes = params.require(:offboarding).permit(:successor_id, :confirmation)
    event = WorkspaceOffboarding.call!(@membership, actor: current_user, **attributes.to_h.symbolize_keys)
    render json: { offboarded: true, receipt_id: event&.id, cleanup_status: event&.details&.fetch("cleanup_status", nil), retained: true }
  end

  private

  def set_membership
    head :forbidden and return unless WorkspaceAuthorization.allowed?(current_user, "offboarding.manage")
    @membership = WorkspaceMembership.in_workspace(Current.workspace).find(params[:workspace_membership_id])
  end
end
