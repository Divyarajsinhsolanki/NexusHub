require "digest"
require "fileutils"
require "json"

module PrivateFiles
  class LegacyQuarantine
    DIRECTORIES = %w[uploads documents temp_uploads].freeze

    def initialize(root: Rails.root)
      @root = Pathname.new(root)
    end

    def call(dry_run: true)
      if DIRECTORIES.any? { |name| File.symlink?(@root.join("public", name)) }
        raise ArgumentError, "Review legacy directory symlinks manually before quarantine"
      end
      files = DIRECTORIES.flat_map { |name| Dir.glob(@root.join("public", name, "**", "*"), File::FNM_DOTMATCH) }
        .select { |path| File.file?(path) || File.symlink?(path) }.sort
      raise ArgumentError, "Review legacy symlinks manually before quarantine" if files.any? { |path| File.symlink?(path) }
      return { count: files.size, dry_run: true } if dry_run || files.empty?

      directory = @root.join("storage", "private_file_quarantine", "#{Time.now.utc.strftime('%Y%m%dT%H%M%S')}-#{SecureRandom.hex(8)}")
      FileUtils.mkdir_p(directory, mode: 0o700)
      File.chmod(0o700, directory.parent)
      manifest = { created_at: Time.now.utc.iso8601, ownership: "unknown; never infer ownership from filename", files: [] }
      write_manifest(directory, manifest)
      files.each do |source|
        relative = Pathname.new(source).relative_path_from(@root.join("public")).to_s
        destination = directory.join(relative)
        entry = { source: "public/#{relative}", quarantined: relative, bytes: File.size(source), sha256: Digest::SHA256.file(source).hexdigest }
        FileUtils.mkdir_p(destination.dirname, mode: 0o700)
        # Record the intended destination before moving, for recovery from a crash.
        manifest[:files] << entry.merge(state: "pending")
        write_manifest(directory, manifest)
        FileUtils.mv(source, destination)
        File.chmod(0o600, destination)
        manifest[:files].last[:state] = "quarantined"
        write_manifest(directory, manifest)
      end
      { count: files.size, dry_run: false, manifest: directory.join("manifest.json").to_s }
    end

    private

    def write_manifest(directory, manifest)
      temporary = directory.join("manifest.json.tmp")
      File.open(temporary, File::WRONLY | File::CREAT | File::TRUNC, 0o600) do |file|
        file.write(JSON.pretty_generate(manifest))
        file.flush
        file.fsync
      end
      File.rename(temporary, directory.join("manifest.json"))
    end
  end
end
