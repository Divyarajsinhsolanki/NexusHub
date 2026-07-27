class PortfolioSeedImagesController < ApplicationController
  before_action :require_portfolio_enabled!

  def show
    filename = "#{params[:key]}.webp"
    return head :not_found unless PortfolioSeeder::SCREENSHOT_FILENAMES.include?(filename)

    path = Rails.root.join("app/assets/images/portfolio", filename)
    return head :not_found unless path.file?

    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    send_file path.to_s, type: "image/webp", disposition: "inline"
  end
end
