class PortfolioSeedImagesController < ApplicationController
  before_action :require_portfolio_enabled!

  def show
    filename = "#{params[:key]}.webp"
    return head :not_found unless PortfolioSeeder::SCREENSHOT_FILENAMES.include?(filename)

    path = Rails.root.join("app/assets/images/portfolio", filename)
    return head :not_found unless path.file?

    versioned = params[:v] == Digest::SHA256.file(path).hexdigest.first(16)
    response.headers["Cache-Control"] = versioned ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate"
    send_file path.to_s, type: "image/webp", disposition: "inline"
  end
end
