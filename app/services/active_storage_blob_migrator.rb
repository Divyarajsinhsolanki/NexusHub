class ActiveStorageBlobMigrator
  Result = Struct.new(:scanned, :migrated, :skipped, :failed, :bytes, keyword_init: true)

  def initialize(source_service_name:, destination_service_name:, scope: nil, dry_run: false, output: $stdout,
                 destination_service: nil)
    @source_service_name = source_service_name.to_s
    @destination_service_name = destination_service_name.to_s
    @scope = scope || ActiveStorage::Blob.where(service_name: @source_service_name)
    @dry_run = dry_run
    @output = output
    @destination_service = destination_service
  end

  def call
    validate_services!
    result = Result.new(scanned: 0, migrated: 0, skipped: 0, failed: 0, bytes: 0)

    @scope.find_each do |blob|
      result.scanned += 1

      if blob.service_name != @source_service_name
        result.skipped += 1
        next
      end

      if @dry_run
        result.skipped += 1
        report("DRY RUN", blob)
        next
      end

      migrate_blob!(blob)
      result.migrated += 1
      result.bytes += blob.byte_size
      report("MIGRATED", blob)
    rescue StandardError => e
      result.failed += 1
      @output.puts("FAILED blob=#{blob.id} key=#{blob.key}: #{e.class}: #{e.message}")
    end

    result
  end

  private

  def validate_services!
    raise ArgumentError, "Source and destination services must be different" if @source_service_name == @destination_service_name

    ActiveStorage::Blob.services.fetch(@source_service_name.to_sym)
    destination_service
  end

  def migrate_blob!(blob)
    blob.open do |file|
      destination_service.upload(
        blob.key,
        file,
        checksum: blob.checksum,
        filename: blob.filename,
        content_type: blob.content_type
      )
    end

    raise "Destination upload could not be verified" unless destination_service.exist?(blob.key)

    blob.update_columns(service_name: @destination_service_name)
  end

  def destination_service
    @destination_service ||= ActiveStorage::Blob.services.fetch(@destination_service_name.to_sym)
  end

  def report(status, blob)
    @output.puts(
      "#{status} blob=#{blob.id} filename=#{blob.filename} bytes=#{blob.byte_size} " \
      "#{@source_service_name}->#{@destination_service_name}"
    )
  end
end
