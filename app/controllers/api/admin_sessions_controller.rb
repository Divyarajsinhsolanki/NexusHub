class Api::AdminSessionsController < Api::BaseController
  include Rails.application.routes.url_helpers

  def create
    return head :forbidden unless current_user&.owner? || current_user&.admin?

    user = current_user.workspace.users.find_by(id: params[:user_id])
    return render json: { error: 'User not found' }, status: :not_found unless user

    if user.site_admin? || (!current_user.owner? && (user.owner? || user.admin?))
      return head :forbidden
    end

    return render json: { error: 'Account locked' }, status: :unprocessable_entity if user.locked?

    set_jwt_cookie!(user)
    render json: {
      message: 'Impersonation login successful',
      user: authentication_user_payload(user),
      exp: 15.minutes.from_now.to_i
    }
  end

end
