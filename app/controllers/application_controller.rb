class ApplicationController < ActionController::Base
  include ActionController::Cookies

  before_action :set_current_user
  before_action :set_current_request_context
  before_action :enforce_demo_read_only_request!
  after_action :finish_current_request
  rescue_from StandardError, with: :notify_unhandled_exception

  private

  def notify_unhandled_exception(error)
    send_exception_notification(error)
    raise error
  end

  def send_exception_notification(error)
    return unless ErrorNotificationMailer.enabled?

    ErrorNotificationMailer.exception_report(
      exception_class: error.class.name,
      message: error.message,
      backtrace: error.backtrace,
      request_context: exception_request_context
    ).deliver_now
  rescue StandardError => mail_error
    Rails.logger.error("Error notification email failed: #{mail_error.class}: #{mail_error.message}")
  end

  def exception_request_context
    {
      request_id: request.request_id,
      method: request.request_method,
      path: request.fullpath,
      controller: params[:controller],
      action: params[:action],
      user_id: Current.user&.id,
      workspace_id: Current.workspace&.id,
      remote_ip: request.remote_ip,
      params: request.filtered_parameters.except("controller", "action")
    }.compact
  end

  def set_current_user
    Current.user = current_user || user_from_access_cookie
    Current.workspace = Current.user&.workspace
  end

  def set_current_request_context
    Current.request_id = request.request_id
    @request_started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  end

  def finish_current_request
    log_request_summary
  ensure
    reset_current_user
  end

  def log_request_summary
    return unless Rails.env.production?

    duration_ms = @request_started_at ? ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - @request_started_at) * 1000).round(1) : nil
    payload = {
      event: "request",
      request_id: request.request_id,
      method: request.request_method,
      path: request.path,
      format: request.format&.ref,
      status: response.status,
      duration_ms: duration_ms,
      controller: params[:controller],
      action: params[:action],
      user_id: Current.user&.id,
      workspace_id: Current.workspace&.id,
      remote_ip: request.remote_ip,
      user_agent: request.user_agent.to_s.first(180),
      params: request.filtered_parameters.except("controller", "action")
    }.compact

    Rails.logger.info(payload.to_json)
  end

  def enforce_demo_read_only_request!
    return unless Current.user&.demo_account?
    return if request.get? || request.head? || request.options?
    return if demo_session_action?

    render json: { error: "demo_read_only" }, status: :forbidden
  end

  def demo_session_action?
    [
      ["POST", "/api/demo_session"],
      ["POST", "/api/login"],
      ["POST", "/api/refresh"],
      ["DELETE", "/api/logout"],
      ["POST", "/api/contacts"]
    ].include?([request.request_method, request.path])
  end

  def require_portfolio_enabled!
    head :not_found unless PortfolioAccess.enabled?
  end

  def user_from_access_cookie
    token = cookies.signed[:access_token]
    return nil if token.blank?

    payload = JwtService.decode(token)
    user_id = payload[:user_id]
    return nil if user_id.blank?

    User.find_by(id: user_id)
  rescue StandardError
    nil
  end

  def reset_current_user
    Current.reset_all
  end
end
