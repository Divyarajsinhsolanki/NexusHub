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
    @visitor_id = find_or_assign_visitor_id
  end

  def finish_current_request
    log_request_summary
  ensure
    reset_current_user
  end

  def log_request_summary
    return unless Rails.env.production?

    duration_ms = @request_started_at ? ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - @request_started_at) * 1000).round(1) : nil
    payload = request_log_payload(duration_ms)

    Rails.logger.info(payload.to_json)
    AppLoggers.fetch(:request_audit).info(payload.to_json)
  rescue StandardError => error
    Rails.logger.warn("Request audit logging failed: #{error.class}: #{error.message}")
  end

  def request_log_payload(duration_ms)
    user_agent = request.user_agent.to_s
    {
      event: "request",
      time_utc: Time.now.utc.iso8601(3),
      time_ist: Time.now.in_time_zone("Asia/Kolkata").iso8601(3),
      request_id: request.request_id,
      visitor_id: @visitor_id,
      method: request.request_method,
      host: request.host,
      path: request.path,
      fullpath: request.fullpath.to_s.first(500),
      format: request.format&.ref,
      status: response.status,
      duration_ms: duration_ms,
      controller: params[:controller],
      action: params[:action],
      user_id: Current.user&.id,
      workspace_id: Current.workspace&.id,
      remote_ip: request.remote_ip,
      forwarded_for: request.headers["X-Forwarded-For"].to_s.first(250).presence,
      referer: request.referer.to_s.first(500).presence,
      user_agent: user_agent.first(500),
      device: device_details(user_agent),
      params: request.filtered_parameters.except("controller", "action")
    }.compact
  end

  def find_or_assign_visitor_id
    visitor_id = cookies.signed[:visitor_id].presence || SecureRandom.uuid
    cookies.permanent.signed[:visitor_id] = {
      value: visitor_id,
      httponly: true,
      same_site: :lax,
      secure: Rails.env.production?
    }
    visitor_id
  rescue StandardError
    nil
  end

  def device_details(user_agent)
    ua = user_agent.to_s
    {
      browser: detect_browser(ua),
      os: detect_os(ua),
      device_type: detect_device_type(ua)
    }.compact
  end

  def detect_browser(user_agent)
    return "Chrome" if user_agent.include?("Chrome") && !user_agent.include?("Edg")
    return "Edge" if user_agent.include?("Edg")
    return "Firefox" if user_agent.include?("Firefox")
    return "Safari" if user_agent.include?("Safari") && !user_agent.include?("Chrome")
    return "curl" if user_agent.start_with?("curl/")

    "Unknown"
  end

  def detect_os(user_agent)
    return "Android" if user_agent.include?("Android")
    return "iOS" if user_agent.match?(/iPhone|iPad|iPod/)
    return "Windows" if user_agent.include?("Windows")
    return "macOS" if user_agent.include?("Mac OS X")
    return "Linux" if user_agent.include?("Linux")

    "Unknown"
  end

  def detect_device_type(user_agent)
    return "bot" if user_agent.match?(/bot|crawler|spider|slurp/i)
    return "mobile" if user_agent.match?(/Mobile|Android|iPhone/i)
    return "tablet" if user_agent.match?(/iPad|Tablet/i)

    "desktop"
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
