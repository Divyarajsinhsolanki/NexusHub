require "rbconfig"

module PdfDocuments
  # Only runtime libraries, explicit input files and per-operation temporary
  # directories are mounted. No application config, credentials, storage root,
  # home directory or network is available to the parser.
  class Sandbox
    def self.wrap(command)
      executable = ENV.fetch("PDF_SANDBOX_EXECUTABLE", "/usr/bin/bwrap")
      raise ArgumentError, "PDF sandbox is not available" unless File.executable?(executable)
      args = [executable, "--unshare-all", "--die-with-parent", "--new-session", "--cap-drop", "ALL",
        "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--chdir", "/tmp"]
      roots = %w[/usr /bin /lib /lib64 /etc/fonts /etc/ld.so.cache]
      roots += [RbConfig::CONFIG.fetch("prefix"), *Gem.path]
      roots.select { |path| File.exist?(path) }.uniq.each { |path| args.concat(["--ro-bind", path, path]) }
      command.drop(1).each do |path|
        next unless path.start_with?("/")
        if File.file?(path)
          args.concat(["--ro-bind", File.realpath(path), path])
        elsif File.directory?(File.dirname(path)) && File.realpath(File.dirname(path)).start_with?(File.realpath(Dir.tmpdir) + "/")
          # Tools write only inside an existing private, per-operation directory.
          parent = File.dirname(path)
          args.concat(["--bind", parent, parent])
        end
      end
      args + ["--", *command]
    end
  end
end
