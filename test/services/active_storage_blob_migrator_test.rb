require "test_helper"
require "stringio"

class ActiveStorageBlobMigratorTest < ActiveSupport::TestCase
  FakeBlob = Struct.new(
    :id, :key, :filename, :byte_size, :checksum, :content_type, :service_name, :contents,
    keyword_init: true
  ) do
    attr_reader :updated_service_name

    def open
      yield StringIO.new(contents)
    end

    def update_columns(service_name:)
      @updated_service_name = service_name
      self.service_name = service_name
    end
  end

  class FakeScope
    def initialize(blobs)
      @blobs = blobs
    end

    def find_each(&block)
      @blobs.each(&block)
    end
  end

  class FakeDestination
    attr_reader :uploads

    def initialize(verifiable: true)
      @uploads = {}
      @verifiable = verifiable
    end

    def upload(key, io, **options)
      @uploads[key.to_s] = { contents: io.read, options: options }
    end

    def exist?(key)
      @verifiable && @uploads.key?(key.to_s)
    end
  end

  test "updates the database only after the destination verifies the upload" do
    blob = build_blob
    destination = FakeDestination.new

    result = migrator(blob, destination: destination).call

    assert_equal "cloudinary", blob.updated_service_name
    assert_equal "file contents", destination.uploads.fetch("blob-key")[:contents]
    assert_equal 1, result.migrated
    assert_equal blob.byte_size, result.bytes
    assert_equal 0, result.failed
  end

  test "leaves the source service unchanged when verification fails" do
    blob = build_blob

    result = migrator(blob, destination: FakeDestination.new(verifiable: false)).call

    assert_nil blob.updated_service_name
    assert_equal "local", blob.service_name
    assert_equal 0, result.migrated
    assert_equal 1, result.failed
  end

  test "dry run does not upload or update blobs" do
    blob = build_blob
    destination = FakeDestination.new

    result = migrator(blob, destination: destination, dry_run: true).call

    assert_empty destination.uploads
    assert_nil blob.updated_service_name
    assert_equal 1, result.skipped
    assert_equal 0, result.failed
  end

  private

  def build_blob
    FakeBlob.new(
      id: 1,
      key: "blob-key",
      filename: ActiveStorage::Filename.new("avatar.png"),
      byte_size: 13,
      checksum: "checksum",
      content_type: "image/png",
      service_name: "local",
      contents: "file contents"
    )
  end

  def migrator(blob, destination:, dry_run: false)
    ActiveStorageBlobMigrator.new(
      source_service_name: "local",
      destination_service_name: "cloudinary",
      scope: FakeScope.new([blob]),
      dry_run: dry_run,
      output: StringIO.new,
      destination_service: destination
    )
  end
end
