class Api::SupportAccessGrantsController < Api::BaseController
  before_action :require_recent_mfa!
  rescue_from ActiveRecord::RecordInvalid do |error|
    render json: { errors: error.record.errors.full_messages }, status: :unprocessable_entity
  end

  def index
    scope = SupportAccessGrant.where(workspace: current_user.workspace)
    scope = if current_user.site_admin? && current_user.owner?
      scope.or(SupportAccessGrant.where(support_user: current_user))
    elsif !current_user.owner?
      SupportAccessGrant.where(support_user: current_user)
    else
      scope
    end
    return head :forbidden unless current_user.owner? || current_user.site_admin?
    render json: scope.order(created_at: :desc).limit(100).map { |grant| serialize(grant) }
  end

  def create
    return head :forbidden unless current_user.owner? && !current_user.demo_account?
    attributes = params.require(:support_access_grant).permit(:support_email, :reason, :duration_minutes, resources: [])
    minutes = Integer(attributes[:duration_minutes] || 30, exception: false)
    return render json: { error: "Choose a duration between 5 and 60 minutes." }, status: :unprocessable_entity unless minutes && minutes.between?(5, 60)
    grant = nil
    current_user.workspace.with_lock do
      return head :forbidden unless current_user.reload.owner?
      support = User.find_by(email: attributes[:support_email].to_s.strip.downcase)
      grant = SupportAccessGrant.create!(workspace: current_user.workspace, approved_by: current_user, support_user: support,
        reason: attributes[:reason], resources: Array(attributes[:resources]).uniq, expires_at: minutes.minutes.from_now)
      audit!(grant, "support.approved")
    end
    render json: serialize(grant), status: :created
  end

  def revoke
    grant = SupportAccessGrant.where(workspace: current_user.workspace).find(params[:id])
    return head :forbidden unless current_user.owner?
    grant.with_lock do
      grant.update!(revoked_at: Time.current) unless grant.revoked_at
      audit!(grant, "support.revoked")
    end
    render json: serialize(grant)
  end

  def inspect_records
    return head :forbidden unless current_user.site_admin?
    grant = SupportAccessGrant.where(support_user: current_user).find(params[:id])
    result = nil
    grant.with_lock do
      return render json: { error: "support_grant_inactive" }, status: :forbidden unless grant.usable?
      resource = params[:resource].to_s
      return head :forbidden unless grant.resources.include?(resource)
      klass, columns = case resource
      when "projects" then [Project, %i[id name status created_at updated_at]]
      when "teams" then [Team, %i[id name created_at updated_at]]
      when "departments" then [Department, %i[id name created_at updated_at]]
      end
      return head :forbidden unless klass
      # Explicit tenant query and field allowlist; no impersonation or files/secrets.
      result = klass.unscoped.where(workspace_id: grant.workspace_id).order(:id).limit(100).pluck(*columns).map { |row| columns.zip(row).to_h }
      audit!(grant, "support.inspected", resource: resource, returned_records: result.size)
    end
    response.set_header("Cache-Control", "no-store")
    render json: { workspace_name: grant.workspace.name, resource: params[:resource], records: result, limit: 100 }
  end

  private
  def audit!(grant, action, details = {})
    WorkspaceAccessEvent.create!(workspace: grant.workspace, actor: current_user.workspace_id == grant.workspace_id ? current_user : nil, action: action,
      details: details.merge(actor_user_id: current_user.id, grant_id: grant.id, support_user_id: grant.support_user_id, approved_by_id: grant.approved_by_id))
  end
  def serialize(grant)
    { id: grant.id, workspace_name: grant.workspace.name, support_email: grant.support_user&.email,
      approved_by: grant.approved_by&.full_name, reason: grant.reason, resources: grant.resources,
      expires_at: grant.expires_at, revoked_at: grant.revoked_at, active: grant.usable? }
  end
end
