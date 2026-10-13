class Api::AccountController < Api::BaseController
  before_action :require_own_account
  rescue_from Accounts::Lifecycle::InvalidRequest do |error|
    render json: { error: error.message }, status: :unprocessable_entity
  end

  def show
    response.headers['Cache-Control'] = 'no-store'
    render json: { data: lifecycle.status }
  end

  def export
    response.headers['Cache-Control'] = 'no-store'
    render json: { data: Accounts::Export.call(current_user) }
  end

  def code
    render json: { data: lifecycle.send_code! }
  end

  def schedule
    render json: { data: lifecycle.schedule!(code: params[:verification_code], successor_id: params[:successor_id], confirmation: params[:confirmation]) }
  end

  def cancel
    render json: { data: lifecycle.cancel! }
  end

  private

  def lifecycle
    @lifecycle ||= Accounts::Lifecycle.new(current_user)
  end

  def require_own_account
    if current_mobile_session&.impersonating? || current_user.demo_account? || current_user.deleted_at?
      render json: { error: 'Sign in to your own non-demo account to manage account deletion.' }, status: :forbidden
    end
  end
end
