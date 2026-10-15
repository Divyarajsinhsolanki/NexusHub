class Api::ReleaseStatusController < ApplicationController
  def show
    response.set_header('Cache-Control', 'no-store')
    tier = ENV.fetch('DEPLOYMENT_TIER', Rails.env.production? ? 'production' : Rails.env.to_s)
    render json: { revision: ReleaseSecurity::Identity.sha, tier: }
  end
end
