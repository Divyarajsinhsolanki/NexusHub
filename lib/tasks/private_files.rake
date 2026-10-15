namespace :private_files do
  desc "Move unowned legacy public files to a private recoverable quarantine (DRY_RUN defaults true)"
  task quarantine_legacy: :environment do
    dry_run = ENV.fetch("DRY_RUN", "true") != "false"
    puts JSON.generate(PrivateFiles::LegacyQuarantine.new.call(dry_run:))
  end

  desc "Read-only deployment gate for public storage, legacy PDF files, and PDF sandbox availability"
  task audit: :environment do
    legacy = ActiveStorage::Blob.where(service_name: "cloudinary").count
    public_files = %w[uploads documents temp_uploads].sum { |dir| Dir.glob(Rails.root.join("public", dir, "**", "*"), File::FNM_DOTMATCH).count { |path| File.file?(path) } }
    puts "Legacy public Cloudinary blobs: #{legacy}"
    puts "Legacy files under the public webroot: #{public_files}"
    _, error, status = PdfDocuments::Command.capture3(["/bin/true"], timeout: 5, sandbox: true)
    abort "PDF sandbox unavailable: #{error}" unless status.success?
    puts "PDF sandbox: available"
    service = Rails.application.config.active_storage.service.to_s
    abort "Default uploads still use public Cloudinary" if service == "cloudinary"
    abort "Migrate and retire legacy public objects before publishing" if legacy.positive? || public_files.positive?
    puts "Local audit passed. Verify provider ACLs and retirement of old CDN URLs separately."
  end

  desc "Purge abandoned unattached blobs older than 24 hours, including interrupted PDF staging"
  task cleanup_unattached: :environment do
    ActiveStorage::Blob.unattached.where("active_storage_blobs.created_at < ?", 24.hours.ago).find_each(&:purge_later)
  end

  desc "Purge unclaimed upload reservations older than 24 hours (never attached files)"
  task cleanup_reservations: :environment do
    ActiveStorage::Blob.unattached.where("active_storage_blobs.created_at < ?", 24.hours.ago).find_each do |blob|
      blob.purge_later if blob.metadata["mobile_upload"] == true
    end
  end
end

namespace :abuse_prevention do
  desc "Fail abandoned queued PDF operations after one hour; never interrupt a worker with a live lease"
  task cleanup_pdf_queue: :environment do
    AbusePrevention::Maintenance.expire_pdf_queue!
  end
end
