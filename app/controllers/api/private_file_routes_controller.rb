class Api::PrivateFileRoutesController < ActionController::Base
  skip_forgery_protection
  def retired
    response.headers["Cache-Control"] = "no-store"
    head :gone
  end
end
