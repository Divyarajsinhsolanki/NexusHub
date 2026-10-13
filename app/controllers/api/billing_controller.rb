class Api::BillingController < Api::BaseController
  before_action :require_billing_owner!
  rescue_from Billing::Error do |error|
    render json: { error: error.message }, status: :unprocessable_entity
  end
  rescue_from Billing::NotConfigured do |error|
    render json: { error: error.message }, status: :service_unavailable
  end

  def show
    response.headers["Cache-Control"] = "no-store"
    render json: { data: lifecycle.snapshot }
  end

  def checkout
    render json: { data: lifecycle.checkout(provider: params.require(:provider), plan_key: params.require(:plan_key), user: current_user) }
  end

  def refresh
    render json: { data: lifecycle.refresh }
  end

  def portal
    render json: { data: lifecycle.portal }
  end

  def cancel
    render json: { data: lifecycle.cancel }
  end

  private

  def lifecycle
    @lifecycle ||= Billing::Lifecycle.new(current_user.workspace)
  end

  def require_billing_owner!
    return if current_user.owner? && !current_user.demo_account? && !current_mobile_session&.impersonating?
    render json: { error: "Only the workspace owner can manage billing." }, status: :forbidden
  end
end
