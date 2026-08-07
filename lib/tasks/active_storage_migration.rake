namespace :storage do
  desc "Copy Active Storage blobs between services and update their service_name after verification"
  task migrate_service: :environment do
    source = ENV.fetch("SOURCE", "local")
    destination = ENV.fetch("DESTINATION", "cloudinary")
    dry_run = ActiveModel::Type::Boolean.new.cast(ENV["DRY_RUN"])

    result = ActiveStorageBlobMigrator.new(
      source_service_name: source,
      destination_service_name: destination,
      dry_run: dry_run
    ).call

    puts(
      "Migration complete: scanned=#{result.scanned} migrated=#{result.migrated} " \
      "skipped=#{result.skipped} failed=#{result.failed} bytes=#{result.bytes}"
    )

    abort("Migration completed with #{result.failed} failed blob(s); rerun after fixing the errors.") if result.failed.positive?
  end
end
