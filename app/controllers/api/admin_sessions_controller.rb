class Api::AdminSessionsController < Api::BaseController
  def create
    render json: { error: "impersonation_disabled", message: "Use an owner-approved, read-only support grant." }, status: :gone
  end
end
