class Api::V1::MobileSessionsController < Api::V1::BaseController
  before_action :require_mobile_session!

  def index
    sessions = session_owner.mobile_sessions.order(created_at: :desc)
    render_data(sessions.map { |session| serialize_session(session) })
  end

  def destroy
    session = session_owner.mobile_sessions.find(params[:id])
    session.revoke!
    render_data({ revoked: true, current: session.id == current_mobile_session.id })
  end

  def destroy_all
    scope = session_owner.mobile_sessions.active
    scope = scope.where.not(id: current_mobile_session.id) if ActiveModel::Type::Boolean.new.cast(params[:except_current])
    revoked_count = 0
    scope.find_each do |session|
      session.revoke!
      revoked_count += 1
    end
    render_data({ revoked_count: revoked_count })
  end

  private

  def session_owner
    authenticated_mobile_user || current_user
  end

  def require_mobile_session!
    return if current_mobile_session

    render_error(code: "mobile_session_required", message: "A mobile session is required.", status: :forbidden)
  end

  def serialize_session(session)
    {
      id: session.id,
      device_name: session.device_name,
      current: session.id == current_mobile_session.id,
      impersonating: session.impersonating?,
      last_used_at: session.last_used_at,
      expires_at: session.expires_at,
      revoked_at: session.revoked_at,
      created_at: session.created_at
    }
  end
end
