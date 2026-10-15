module AuthenticatedResourceLimits
  extend ActiveSupport::Concern
  included do
    rescue_from AbusePrevention::LimitExceeded do |error|
      response.set_header("Retry-After", error.retry_after.to_s)
      response.set_header("Cache-Control", "no-store")
      render json: { error: "resource_limit_exceeded", message: error.message }, status: :too_many_requests
    end
    rescue_from AbusePrevention::RateLimiter::Unavailable do
      response.set_header("Retry-After", "30")
      render json: { error: "rate_limiter_unavailable", message: "Please try again shortly." }, status: :service_unavailable
    end
  end

  private

  def enforce_authenticated_resource_limits!
    return unless current_user
    if controller_name == "account" && action_name == "export"
      return AbusePrevention::RateLimiter.check!(current_user, :exports)
    end
    if controller_name == "search"
      return AbusePrevention::RateLimiter.check!(current_user, :search)
    end
    if controller_name == "file_access"
      return AbusePrevention::RateLimiter.check!(current_user, :files)
    end
    return if request.get? || request.head? || request.options?
    AbusePrevention::RateLimiter.check!(current_user, :writes)
    category = case controller_name
    when "uploads" then :uploads
    when "pdf_documents", "pdf_document_operations" then :pdf
    when "messages", "scheduled_chat_messages" then :messages
    when "workspace_invitations" then :invitations
    when "account" then :exports if action_name == "export"
    when "workspace_integrations", "keka", "project_operations", "project_deployments" then :integration
    end
    AbusePrevention::RateLimiter.check!(current_user, category) if category
  end
end
