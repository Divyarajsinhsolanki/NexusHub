class Api::WorkspaceInvitationsController < Api::BaseController
  skip_before_action :authenticate_user!, :enforce_demo_read_only!, only: [:preview, :accept]
  before_action :authorize_invites!, except: [:preview, :accept]
  rescue_from WorkspaceInvitations::InvalidInvitation do |error|
    render json: { errors: [error.message] }, status: :unprocessable_entity
  end
  rescue_from ActiveRecord::RecordInvalid do |error|
    render json: { errors: error.record.errors.full_messages }, status: :unprocessable_entity
  end

  def index
    render json: WorkspaceInvitation.in_workspace(Current.workspace).order(created_at: :desc).limit(200).map { |invitation| serialize(invitation) }
  end

  def create
    attributes = params.require(:workspace_invitation).permit(:email, :department_id, role_names: [], project_ids: [])
    attributes[:project_ids] = Array(attributes[:project_ids]).map(&:to_i).uniq if attributes.key?(:project_ids)
    invitation = WorkspaceInvitations.issue!(actor: current_user, attributes: attributes.to_h)
    render json: serialize(invitation), status: :created
  end

  def resend
    invitation = WorkspaceInvitation.in_workspace(Current.workspace).find(params[:id])
    render json: serialize(WorkspaceInvitations.resend!(invitation, actor: current_user))
  end

  def revoke
    invitation = WorkspaceInvitation.in_workspace(Current.workspace).find(params[:id])
    render json: serialize(WorkspaceInvitations.revoke!(invitation, actor: current_user))
  end

  def preview
    invitation = WorkspaceInvitations.find_valid!(params[:invitation_token])
    existing = User.find_by(email: invitation.email)
    response.set_header("Cache-Control", "no-store")
    response.set_header("Referrer-Policy", "no-referrer")
    render json: { email: invitation.email, workspace_name: invitation.workspace.name,
      roles: invitation.role_names, expires_at: invitation.expires_at,
      existing_account: existing.present?, other_workspace: existing && existing.workspace_id != invitation.workspace_id }
  end

  def accept
    attributes = params.require(:account).permit(:first_name, :last_name, :password, :password_confirmation, :current_password, :job_title)
    user = WorkspaceInvitations.accept!(raw: params[:invitation_token], attributes: attributes.to_h.symbolize_keys, actor: authentication_user)
    response.set_header("Cache-Control", "no-store")
    render json: { accepted: true, message: "Invitation accepted. Sign in to your company workspace.", workspace_name: user.workspace.name }
  end

  private

  def authorize_invites!
    head :forbidden unless WorkspaceAuthorization.allowed?(current_user, "invitations.manage")
  end

  def serialize(invitation)
    { id: invitation.id, email: invitation.email, status: invitation.effective_status,
      roles: invitation.role_names, project_ids: invitation.project_ids, department_id: invitation.department_id,
      expires_at: invitation.expires_at, delivery_status: invitation.delivery_status, created_at: invitation.created_at }
  end
end
