require "digest"

# Refresh repository-owned screenshots while preserving uploaded custom media.
module ShowcaseMedia
  module_function

  def attach!(attachment, filename)
    path = Rails.root.join("app/assets/images/portfolio", filename)
    return unless path.file?
    if attachment.attached?
      return unless PortfolioSeeder::SCREENSHOT_FILENAMES.include?(attachment.blob.filename.to_s)
      return if attachment.blob.filename.to_s == filename && attachment.blob.checksum == Digest::MD5.file(path).base64digest
    end
    File.open(path, "rb") { |io| attachment.attach(io: io, filename: filename, content_type: "image/webp") }
  end

  def url(filename)
    path = Rails.root.join("app/assets/images/portfolio", filename)
    version = path.file? ? "?v=#{Digest::SHA256.file(path).hexdigest.first(16)}" : ""
    "/portfolio-seed-images/#{File.basename(filename, '.webp')}#{version}"
  end
end
