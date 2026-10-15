require "test_helper"

class LegacyFileQuarantineTest < ActiveSupport::TestCase
  test "quarantine preserves bytes with a recovery manifest and never guesses an owner" do
    Dir.mktmpdir do |root|
      public_directory = File.join(root, "public", "uploads")
      FileUtils.mkdir_p(public_directory)
      original = File.join(public_directory, "unowned.pdf")
      File.binwrite(original, "%PDF sensitive")
      service = PrivateFiles::LegacyQuarantine.new(root:)
      assert_equal 1, service.call.fetch(:count)
      assert File.exist?(original), "Dry run must not move files"
      result = service.call(dry_run: false)
      refute File.exist?(original)
      manifest = JSON.parse(File.read(result.fetch(:manifest)))
      assert_includes manifest.fetch("ownership"), "unknown"
      entry = manifest.fetch("files").first
      destination = File.join(File.dirname(result.fetch(:manifest)), entry.fetch("quarantined"))
      assert_equal "%PDF sensitive", File.binread(destination)
      assert_equal Digest::SHA256.file(destination).hexdigest, entry.fetch("sha256")
      assert_equal "quarantined", entry.fetch("state")
      assert_equal 0o600, File.stat(destination).mode & 0o777
    end
  end

  test "symlink review fails without moving or reading its target" do
    Dir.mktmpdir do |root|
      FileUtils.mkdir_p(File.join(root, "public", "documents"))
      File.symlink("/etc/passwd", File.join(root, "public", "documents", "link.pdf"))
      assert_raises(ArgumentError) { PrivateFiles::LegacyQuarantine.new(root:).call(dry_run: false) }
      refute Dir.exist?(File.join(root, "storage"))
    end
  end
end
