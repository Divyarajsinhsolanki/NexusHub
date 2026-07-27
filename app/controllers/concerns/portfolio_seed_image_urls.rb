module PortfolioSeedImageUrls
  extend ActiveSupport::Concern

  private

  def portfolio_attachment_url(attachment, disposition: "inline")
    return unless attachment&.attached?

    filename = attachment.blob.filename.to_s
    return portfolio_seed_image_path(filename) if seeded_portfolio_image?(filename)

    Rails.application.routes.url_helpers.rails_blob_path(
      attachment,
      only_path: true,
      disposition: disposition
    )
  end

  def seeded_portfolio_image?(filename)
    PortfolioSeeder::SCREENSHOT_FILENAMES.include?(filename)
  end

  def portfolio_seed_image_path(filename)
    "/portfolio-seed-images/#{File.basename(filename, ".webp")}"
  end
end
