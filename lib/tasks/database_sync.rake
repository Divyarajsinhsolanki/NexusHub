require "cgi"
require "fileutils"
require "open3"
require "uri"

module DatabaseSyncTasks
  Error = Class.new(StandardError)

  Connection = Struct.new(
    :label,
    :database,
    :host,
    :port,
    :username,
    :password,
    :sslmode,
    keyword_init: true
  ) do
    def self.from_url(label:, url:)
      uri = URI.parse(url.to_s)
      unless %w[postgres postgresql].include?(uri.scheme)
        raise Error, "#{label} database URL must start with postgres:// or postgresql://."
      end

      query_params = uri.query ? URI.decode_www_form(uri.query).to_h : {}
      database_name = CGI.unescape(uri.path.to_s.sub(%r{\A/}, ""))
      raise Error, "#{label} database URL must include a database name." if database_name.empty?

      new(
        label: label,
        database: database_name,
        host: uri.host,
        port: uri.port,
        username: uri.user ? CGI.unescape(uri.user) : nil,
        password: uri.password ? CGI.unescape(uri.password) : nil,
        sslmode: query_params["sslmode"]
      )
    rescue URI::InvalidURIError => e
      raise Error, "#{label} database URL is invalid: #{e.message}"
    end

    def self.from_rails_config
      config = ActiveRecord::Base.connection_db_config.configuration_hash
      adapter = config[:adapter] || config["adapter"]
      raise Error, "Local Rails database adapter must be postgresql." unless adapter.to_s == "postgresql"

      if (url = config[:url] || config["url"])
        return from_url(label: "local", url: url)
      end

      database_name = config[:database] || config["database"]
      raise Error, "Local Rails database config must include a database name." if database_name.to_s.empty?

      new(
        label: "local",
        database: database_name,
        host: (config[:host] || config["host"] || "localhost"),
        port: (config[:port] || config["port"]),
        username: (config[:username] || config["username"]),
        password: (config[:password] || config["password"]),
        sslmode: (config[:sslmode] || config["sslmode"])
      )
    end

    def pg_env
      {
        "PGAPPNAME" => "rails_vite_database_sync",
        "PGDATABASE" => database,
        "PGHOST" => host,
        "PGPASSWORD" => password,
        "PGPORT" => port&.to_s,
        "PGSSLMODE" => sslmode,
        "PGUSER" => username
      }.reject { |_key, value| value.to_s.empty? }
    end

    def description
      location = [host, port].compact.join(":")
      location = "default PostgreSQL host" if location.empty?
      "#{database} on #{location}"
    end
  end

  class Runner
    EXTERNAL_URL_ENV_NAMES = %w[
      RENDER_DATABASE_URL
      EXTERNAL_DATABASE_URL
      REMOTE_DATABASE_URL
    ].freeze

    EXPORT_CONFIRMATION = "export-local-to-external"
    IMPORT_CONFIRMATION = "import-external-to-local"
    TRUE_VALUES = %w[1 true yes y].freeze

    def initialize(direction:)
      @direction = direction
      @timestamp = Time.now.utc.strftime("%Y%m%dT%H%M%SZ")
    end

    def run
      ensure_safe_rails_environment!
      ensure_psql_available!
      FileUtils.mkdir_p(backup_dir)

      case direction
      when :export
        export_local_to_external
      when :import
        import_external_to_local
      when :check
        check_connections
      else
        raise Error, "Unknown database sync direction: #{direction.inspect}"
      end
    end

    private

    attr_reader :direction, :timestamp

    def export_local_to_external
      require_confirmation!(
        EXPORT_CONFIRMATION,
        "replace the external database with your local Rails database"
      )

      external_backup = backup_path("external-before-export")
      local_dump = backup_path("local-export")

      puts "Backing up external database (#{external.description}) to #{external_backup}..."
      dump_database(external, external_backup)

      puts "Dumping local database (#{local.description}) to #{local_dump}..."
      dump_database(local, local_dump)

      puts "Restoring local dump into external database (#{external.description})..."
      restore_database(external, local_dump)

      puts "Export complete."
      puts "External backup: #{external_backup}"
      puts "Local dump: #{local_dump}"
    end

    def import_external_to_local
      require_confirmation!(
        IMPORT_CONFIRMATION,
        "replace your local Rails database with the external database"
      )

      local_backup = backup_path("local-before-import")
      external_dump = backup_path("external-import")

      puts "Backing up local database (#{local.description}) to #{local_backup}..."
      dump_database(local, local_backup)

      puts "Dumping external database (#{external.description}) to #{external_dump}..."
      dump_database(external, external_dump)

      puts "Restoring external dump into local database (#{local.description})..."
      restore_database(local, external_dump)

      puts "Import complete."
      puts "Local backup: #{local_backup}"
      puts "External dump: #{external_dump}"
    end

    def check_connections
      local_major = server_major(local)
      external_major = server_major(external)
      client = pg_client

      puts "Local database: #{local.description} (PostgreSQL #{local_major})"
      puts "External database: #{external.description} (PostgreSQL #{external_major})"
      if client == :docker
        puts "PostgreSQL client: Docker image #{postgres_client_image}"
      else
        puts "PostgreSQL client: native pg_dump/pg_restore #{native_client_major}"
      end
    end

    def local
      @local ||= begin
        local_url = first_env_value("LOCAL_DATABASE_URL", "DATABASE_SYNC_LOCAL_DATABASE_URL")
        local_url ? Connection.from_url(label: "local", url: local_url) : Connection.from_rails_config
      end
    end

    def external
      @external ||= begin
        candidates = env_value_pairs(*EXTERNAL_URL_ENV_NAMES)
        if candidates.empty?
          raise Error, "Set one of #{EXTERNAL_URL_ENV_NAMES.join(', ')} to the external PostgreSQL URL."
        end

        connections = candidates.map do |_env_name, external_url|
          Connection.from_url(label: "external", url: external_url)
        end
        connection = connections.find { |candidate| !render_internal_hostname?(candidate.host) } || connections.first
        validate_external_connection!(connection)
        connection
      end
    end

    def validate_external_connection!(connection)
      return unless render_internal_hostname?(connection.host)

      raise Error, <<~MESSAGE
        The external database URL is using Render's internal hostname: #{connection.host}

        That hostname only resolves inside Render's private network. From your local machine,
        copy the External Database URL from the Render Postgres Connect menu and set
        RENDER_DATABASE_URL or EXTERNAL_DATABASE_URL to that value.
      MESSAGE
    end

    def render_internal_hostname?(host)
      host.to_s.match?(/\Adpg-[a-z0-9-]+\z/i)
    end

    def backup_dir
      @backup_dir ||= File.expand_path(
        ENV.fetch("DATABASE_SYNC_DIR", Rails.root.join("tmp", "database-sync").to_s),
        Rails.root.to_s
      )
    end

    def backup_path(prefix)
      File.join(backup_dir, "#{prefix}-#{timestamp}.dump")
    end

    def dump_database(connection, output_path)
      run_pg_tool!(
        connection,
        "pg_dump",
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--file",
        output_path
      )
    end

    def restore_database(connection, input_path)
      run_pg_tool!(
        connection,
        "pg_restore",
        "--clean",
        "--if-exists",
        "--single-transaction",
        "--no-owner",
        "--no-privileges",
        "--exit-on-error",
        "--dbname",
        connection.database,
        input_path
      )
    end

    def run_pg_tool!(connection, command, *arguments)
      display_command = ([command] + arguments).join(" ")
      puts "Running #{display_command} against #{connection.label}..."
      return if dry_run?

      success =
        if pg_client == :docker
          run_pg_tool_with_docker(connection, command, arguments)
        else
          system(connection.pg_env, command, *arguments)
        end
      raise Error, "#{command} failed for #{connection.label} database (#{connection.description})." unless success
    end

    def run_pg_tool_with_docker(connection, command, arguments)
      docker_arguments = [
        "run",
        "--rm",
        "--network",
        "host",
        "--volume",
        "#{backup_dir}:/database-sync"
      ]

      connection.pg_env.each_key do |key|
        docker_arguments.concat(["--env", key])
      end

      docker_arguments << postgres_client_image
      docker_arguments << command
      docker_arguments.concat(arguments.map { |argument| container_argument(argument) })

      system(connection.pg_env, "docker", *docker_arguments)
    end

    def container_argument(argument)
      value = argument.to_s
      expanded_path = File.expand_path(value, Rails.root.to_s)

      if expanded_path == backup_dir || expanded_path.start_with?("#{backup_dir}/")
        File.join("/database-sync", File.basename(expanded_path))
      else
        value
      end
    end

    def pg_client
      @pg_client ||= begin
        required_major = [server_major(local), server_major(external)].max
        native_major = native_client_major
        if native_major && native_major >= required_major
          :native
        else
          configure_docker_client!(required_major, native_major)
          :docker
        end
      end
    end

    def server_major(connection)
      @server_majors ||= {}
      cache_key = [connection.label, connection.host, connection.port, connection.database].join(":")
      @server_majors[cache_key] ||= begin
        output, error, status = Open3.capture3(
          connection.pg_env,
          "psql",
          "--no-align",
          "--tuples-only",
          "--command",
          "SHOW server_version_num"
        )
        unless status.success?
          raise Error, "Could not read PostgreSQL server version for #{connection.label} database: #{error.presence || output}"
        end

        version_number = output.to_s.strip.to_i
        raise Error, "Could not parse PostgreSQL server version for #{connection.label} database." unless version_number.positive?

        version_number / 10_000
      end
    end

    def native_client_major
      [native_tool_major("pg_dump"), native_tool_major("pg_restore")].compact.min
    end

    def native_tool_major(command)
      return unless command_available?(command)

      output, _error, status = Open3.capture3(command, "--version")
      return unless status.success?

      output.to_s[/\b(\d+)(?:\.\d+)?\b/, 1]&.to_i
    end

    def configure_docker_client!(required_major, native_major)
      ensure_docker_available!
      @postgres_client_image = ENV.fetch("POSTGRES_CLIENT_IMAGE", "postgres:#{required_major}-alpine")
      puts "Native PostgreSQL client #{native_major || 'not found'} is older than server #{required_major}; using #{@postgres_client_image}."

      output, error, status = Open3.capture3("docker", "run", "--rm", postgres_client_image, "pg_dump", "--version")
      unless status.success?
        raise Error, "Could not run #{postgres_client_image}. Docker said: #{error.presence || output}"
      end

      docker_major = output.to_s[/\b(\d+)(?:\.\d+)?\b/, 1]&.to_i
      if docker_major.to_i < required_major
        raise Error, "#{postgres_client_image} provides PostgreSQL client #{docker_major}, but server #{required_major} is required."
      end
    end

    def postgres_client_image
      @postgres_client_image
    end

    def require_confirmation!(expected_value, action)
      return if dry_run?
      return if ENV["CONFIRM_DATABASE_SYNC"] == expected_value

      raise Error, <<~MESSAGE
        Refusing to #{action}.

        Stop app writes first, then rerun with:
          CONFIRM_DATABASE_SYNC=#{expected_value} bin/rails db:external:#{direction}
      MESSAGE
    end

    def ensure_safe_rails_environment!
      return unless Rails.env.production?
      return if ENV["ALLOW_PRODUCTION_DATABASE_SYNC"] == "1"

      raise Error, "Refusing to run database sync tasks with RAILS_ENV=production."
    end

    def ensure_psql_available!
      return if dry_run?
      return if command_available?("psql")

      raise Error, "psql is required to detect database server versions. Install PostgreSQL client tools first."
    end

    def ensure_docker_available!
      return if command_available?("docker")

      raise Error, "Docker is required because the local PostgreSQL client is too old. Install PostgreSQL client 18+ or Docker."
    end

    def command_available?(command)
      ENV.fetch("PATH", "").split(File::PATH_SEPARATOR).any? do |directory|
        File.executable?(File.join(directory, command))
      end
    end

    def first_env_value(*names)
      names.map { |name| ENV[name].to_s.strip }.find { |value| !value.empty? }
    end

    def env_value_pairs(*names)
      names.filter_map do |name|
        value = ENV[name].to_s.strip
        [name, value] unless value.empty?
      end
    end

    def dry_run?
      TRUE_VALUES.include?(ENV["DRY_RUN"].to_s.downcase)
    end
  end
end

namespace :db do
  namespace :external do
    desc "Export local Rails database to EXTERNAL_DATABASE_URL / RENDER_DATABASE_URL"
    task export: :environment do
      DatabaseSyncTasks::Runner.new(direction: :export).run
    rescue DatabaseSyncTasks::Error => e
      abort e.message
    end

    desc "Import EXTERNAL_DATABASE_URL / RENDER_DATABASE_URL into the local Rails database"
    task import: :environment do
      DatabaseSyncTasks::Runner.new(direction: :import).run
    rescue DatabaseSyncTasks::Error => e
      abort e.message
    end

    desc "Check local/external database connectivity and PostgreSQL client compatibility"
    task check: :environment do
      DatabaseSyncTasks::Runner.new(direction: :check).run
    rescue DatabaseSyncTasks::Error => e
      abort e.message
    end

    desc "Print database sync task usage"
    task :help do
      puts <<~HELP
        Database sync tasks:

          bin/rails db:external:export
            Local Rails database -> external database.
            Requires CONFIRM_DATABASE_SYNC=#{DatabaseSyncTasks::Runner::EXPORT_CONFIRMATION}

          bin/rails db:external:import
            External database -> local Rails database.
            Requires CONFIRM_DATABASE_SYNC=#{DatabaseSyncTasks::Runner::IMPORT_CONFIRMATION}

          bin/rails db:external:check
            Non-destructive connectivity and PostgreSQL client compatibility check.

        Environment variables:
          RENDER_DATABASE_URL or EXTERNAL_DATABASE_URL  External PostgreSQL URL.
          LOCAL_DATABASE_URL                           Optional local PostgreSQL URL override.
          DATABASE_SYNC_DIR                            Optional dump directory, default tmp/database-sync.
          POSTGRES_CLIENT_IMAGE                        Optional Docker client image override.
          DRY_RUN=1                                    Print planned commands without running them.
      HELP
    end
  end
end
