class Api::BaseController < ApplicationController
  include SessionCookieAuthentication

  protect_from_forgery with: :null_session
  before_action :set_request_context
  before_action :authenticate_user!
  before_action :enforce_demo_read_only!
  before_action :set_cache_headers, if: :cacheable_api_request?

  def authenticate_user!
    @current_user = authentication_user
    Current.user = @current_user
    Current.workspace = @current_user&.workspace

    return if @current_user

    log_application_warning('Unauthorized API access attempt')
    handle_unauthorized
  rescue StandardError => e
    AppEventLogger.error(
      :application_errors,
      source: "#{self.class.name}#authenticate_user!",
      message: 'Authentication failed',
      exception: e,
      payload: basic_request_context
    )
    handle_unauthorized
  end

  def current_user
    @current_user || devise_session_user
  end

  def current_mobile_session
    @current_mobile_session
  end

  def authenticated_mobile_user
    @authenticated_mobile_user
  end

  private

  def authentication_user
    bearer_token_user || jwt_cookie_user || devise_session_user
  end

  def enforce_demo_read_only!
    return unless current_user&.demo_account?
    return if request.get? || request.head?
    return if controller_name == "auth" && action_name == "logout"

    render json: { error: "demo_read_only" }, status: :forbidden
  end

  def jwt_cookie_user
    token = cookies.signed[:access_token]
    payload = JwtService.decode(token)
    User.find_by(id: payload["user_id"]) if payload
  end

  def bearer_token_user
    scheme, token = request.authorization.to_s.split(" ", 2)
    return unless scheme&.casecmp?("Bearer") && token.present?

    payload = JwtService.decode(token)
    return if payload.blank? || payload[:error].present?
    return unless payload[:type] == "mobile_access"

    if payload[:mobile_session_id].present?
      session = MobileSession.active.includes(:user, :impersonated_user).find_by(id: payload[:mobile_session_id])
      return unless session

      effective_user = session.effective_user
      return unless effective_user.id == payload[:user_id].to_i
      return if session.user.locked? || effective_user.locked?

      @current_mobile_session = session
      @authenticated_mobile_user = session.user
      return effective_user
    end

    # Access tokens issued before session-bound tokens were introduced remain
    # usable for their original 15-minute lifetime.
    user = User.find_by(id: payload[:user_id])
    user unless user&.locked?
  end

  def devise_session_user
    return nil unless defined?(super)

    super
  end

  def set_request_context
    Current.request_id = request.request_id
  end

  def cacheable_api_request?
    request.get? && %w[index show].include?(action_name)
  end

  def set_cache_headers
    response.headers['Cache-Control'] = 'private, max-age=0, must-revalidate'
    response.headers['Vary'] = response.headers['Vary'].to_s
      .split(',')
      .map(&:strip)
      .reject(&:blank?)
      .union(%w[Cookie Authorization])
      .join(', ')
  end

  def basic_request_context(extra = {})
    {
      method: request.request_method,
      path: request.fullpath,
      project_id: params[:project_id],
      resource_id: params[:id]
    }.merge(extra).compact
  end

  def controller_action_source
    "#{self.class.name}##{action_name}"
  end

  def log_project_event(level, message, payload: {}, exception: nil)
    write_log(:project_dashboard, level, message, payload: payload, exception: exception)
  end

  def log_sheet_event(level, message, payload: {}, exception: nil)
    write_log(:sheet_operations, level, message, payload: payload, exception: exception)
  end

  def log_project_dashboard_exceptions
    yield
  rescue StandardError => e
    log_project_event(:error, 'Unhandled project dashboard error', exception: e)
    raise
  end

  def log_sheet_request_exceptions
    yield
  rescue StandardError => e
    log_sheet_event(:error, 'Unhandled sheet request error', exception: e)
    raise
  end

  def handle_unauthorized
    render json: { error: "Unauthorized" }, status: :unauthorized
  end

  def log_application_warning(message, payload: {})
    AppEventLogger.warn(:application_errors, source: controller_action_source, message: message, payload: basic_request_context(payload))
  end

  def write_log(channel, level, message, payload:, exception: nil)
    full_payload = basic_request_context(payload)

    case level.to_sym
    when :info
      AppEventLogger.info(channel, source: controller_action_source, message: message, payload: full_payload)
    when :warn
      AppEventLogger.warn(channel, source: controller_action_source, message: message, payload: full_payload)
    else
      AppEventLogger.error(channel, source: controller_action_source, message: message, exception: exception, payload: full_payload)
    end
  end

  def render_paginated_collection(scope, serializer: nil, per_page: nil)
    page = params[:page].to_i
    page = 1 if page < 1
    per = (params[:per_page] || per_page || 25).to_i
    per = 25 if per < 1

    paginated_scope = scope.respond_to?(:page) ? scope : Kaminari.paginate_array(Array(scope))
    paginated = paginated_scope.page(page).per(per)
    data = serializer ? paginated.map { |record| serializer.call(record) } : paginated

    render json: {
      data: data,
      meta: {
        current_page: paginated.current_page,
        next_page: paginated.next_page,
        prev_page: paginated.prev_page,
        total_pages: paginated.total_pages,
        total_count: paginated.total_count,
        per_page: paginated.limit_value
      }
    }
  end
end
