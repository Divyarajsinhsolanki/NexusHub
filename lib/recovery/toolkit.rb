require 'securerandom'
require 'json'
require 'digest'
require 'base64'
require 'time'
require 'fileutils'
require 'tmpdir'
require 'open3'
require 'uri'
require 'rubygems/package'
require 'pg'

module Recovery
  class Error < StandardError; end

  class Toolkit
    MAX_OBJECT_BYTES = 5 * 1024**3
    def initialize(env = ENV, out: $stdout, blob_downloader: nil)
      @env, @out, @blob_downloader = env, out, blob_downloader
    end

    def required(name)
      value = @env[name].to_s
      raise Error, "Configure #{name}." if value.empty?
      value
    end

    def command(*args, env: {})
      output, _errors, status = Open3.capture3(env, *args)
      raise Error, "#{File.basename(args.first)} failed; inspect the protected host/provider diagnostics." unless status.success?
      output
    end

    def database_env(url_name = 'BACKUP_DATABASE_URL')
      url = @env[url_name]
      if url && !url.empty?
        uri = URI.parse(url)
        raise Error, "Invalid #{url_name}." unless %w[postgres postgresql].include?(uri.scheme) && uri.host && uri.path.length > 1 && !uri.fragment
        # Only libpq SSL parameters are supported; no service/options injection.
        query = URI.decode_www_form(uri.query.to_s).to_h
        raise Error, 'Unsupported database URL options.' unless (query.keys - %w[sslmode sslrootcert sslcert sslkey]).empty?
        values = { 'PGHOST' => uri.host, 'PGPORT' => (uri.port || 5432).to_s,
          'PGDATABASE' => URI::DEFAULT_PARSER.unescape(uri.path.delete_prefix('/')),
          'PGUSER' => URI::DEFAULT_PARSER.unescape(uri.user.to_s), 'PGPASSWORD' => URI::DEFAULT_PARSER.unescape(uri.password.to_s) }
        query.each { |key, value| values["PG#{key.upcase}"] = value }
      else
        raise Error, "Configure #{url_name}." if url_name == 'RESTORE_DATABASE_URL'
        values = %w[PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSSLMODE PGSSLROOTCERT PGSSLCERT PGSSLKEY].to_h { |key| [key, @env[key]] }.compact
        raise Error, 'Configure PGHOST and PGDATABASE or BACKUP_DATABASE_URL.' if values['PGHOST'].to_s.empty? || values['PGDATABASE'].to_s.empty?
      end
      values.merge('PGCONNECT_TIMEOUT' => '10')
    rescue URI::InvalidURIError
      raise Error, "Invalid #{url_name}."
    end

    def connect(values)
      mapping = { 'PGHOST' => 'host', 'PGPORT' => 'port', 'PGDATABASE' => 'dbname', 'PGUSER' => 'user', 'PGPASSWORD' => 'password',
        'PGSSLMODE' => 'sslmode', 'PGSSLROOTCERT' => 'sslrootcert', 'PGSSLCERT' => 'sslcert', 'PGSSLKEY' => 'sslkey', 'PGCONNECT_TIMEOUT' => 'connect_timeout' }
      PG.connect(values.to_h.filter_map { |key, value| [mapping[key], value] if mapping[key] && !value.to_s.empty? }.to_h)
    end

    def fingerprint(values)
      Digest::SHA256.hexdigest([values['PGHOST'], values.fetch('PGPORT', '5432'), values['PGDATABASE']].join(':'))
    end

    def inventory(connection)
      names = connection.exec("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename").column_values(0)
      counts = names.to_h { |name| [name, connection.exec("SELECT count(*) FROM public.#{PG::Connection.quote_ident(name)}").getvalue(0, 0).to_i] }
      versions = names.include?('schema_migrations') ? connection.exec('SELECT version FROM schema_migrations ORDER BY version').column_values(0) : []
      { 'table_counts' => counts, 'migration_versions' => versions }
    end

    def backup
      started = Time.now.utc
      root = File.expand_path(required('BACKUP_DIRECTORY'))
      FileUtils.mkdir_p(root, mode: 0700)
      File.open(File.join(root, '.backup.lock'), File::RDWR | File::CREAT, 0600) do |lock|
        raise Error, 'Another backup is running.' unless lock.flock(File::LOCK_EX | File::LOCK_NB)
        values = database_env
        revision, keyset = required('APP_REVISION'), required('BACKUP_KEYSET_ID')
        raise Error, 'APP_REVISION must identify the deployed release.' if %w[unknown latest].include?(revision)
        mode = required('BACKUP_UPLOAD_MODE')
        raise Error, 'BACKUP_UPLOAD_MODE must be local, active_storage or external.' unless %w[local external active_storage].include?(mode)
        raise Error, 'Confirm writes and workers are quiesced before capturing local uploads.' if mode == 'local' && @env['BACKUP_WRITES_QUIESCED'] != 'true'
        raise Error, 'External upload recovery requires BACKUP_UPLOAD_RECOVERY_REFERENCE.' if mode == 'external' && @env['BACKUP_UPLOAD_RECOVERY_REFERENCE'].to_s.empty?
        public_key = File.expand_path(required('BACKUP_PUBLIC_KEY_FILE'))
        raise Error, 'Backup recipient must be a public-only armored key file.' unless File.file?(public_key) && File.read(public_key, 128).include?('BEGIN PGP PUBLIC KEY BLOCK')
        name = "nexus-#{started.strftime('%Y%m%dT%H%M%SZ')}-#{SecureRandom.hex(6)}"
        Dir.mktmpdir('.backup-work-', root) do |work|
          File.chmod(0700, work)
          manifest = { 'format' => 1, 'started_at' => started.iso8601, 'app_revision' => revision,
            'keyset_id' => keyset, 'database_fingerprint' => fingerprint(values), 'uploads_mode' => mode,
            'upload_recovery_reference' => @env['BACKUP_UPLOAD_RECOVERY_REFERENCE'], 'files' => {} }
          connection = connect(values)
          begin
            connection.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
            snapshot = connection.exec('SELECT pg_export_snapshot()').getvalue(0, 0)
            manifest.merge!(inventory(connection))
            if mode == 'active_storage'
              raise Error, 'Active Storage capture must run through rails recovery:backup.' unless @blob_downloader
              manifest['blobs'] = connection.exec('SELECT id, key, service_name, byte_size, checksum FROM active_storage_blobs ORDER BY id').to_a
            end
            dump = File.join(work, 'database.dump')
            command('pg_dump', '--format=custom', '--no-owner', '--no-privileges', "--snapshot=#{snapshot}", '--file', dump, env: values)
            command('pg_restore', '--list', dump)
          ensure
            connection.close
          end
          files = { 'database.dump' => dump }
          if mode == 'active_storage'
            manifest.fetch('blobs').each do |blob|
              key = blob.fetch('key')
              raise Error, 'Invalid storage key; no files were published.' unless key.match?(/\A[a-zA-Z0-9_-]{4,128}\z/)
              name_in_archive = "uploads/#{key[0, 2]}/#{key[2, 2]}/#{key}"
              path = File.join(work, name_in_archive)
              FileUtils.mkdir_p(File.dirname(path), mode: 0700)
              @blob_downloader.call(blob, path)
              raise Error, 'Upload size/checksum mismatch; no backup success was recorded.' unless File.size(path) == blob.fetch('byte_size').to_i && Base64.strict_encode64(Digest::MD5.file(path).digest) == blob['checksum']
              files[name_in_archive] = path
            end
          end
          if mode == 'local'
            uploads = File.realpath(required('BACKUP_UPLOAD_ROOT'))
            raise Error, 'Do not back up a filesystem root as uploads.' if uploads == '/'
            Dir.glob(File.join(uploads, '**', '*'), File::FNM_DOTMATCH).sort.each do |path|
              next if %w[. ..].include?(File.basename(path))
              raise Error, 'Upload snapshots must contain regular files/directories, not symlinks.' if File.symlink?(path) || (!File.directory?(path) && !File.file?(path))
              files["uploads/#{path.delete_prefix(uploads + '/')}"] = path if File.file?(path)
            end
          end
          files.each { |name_in_archive, path| manifest['files'][name_in_archive] = { 'sha256' => Digest::SHA256.file(path).hexdigest, 'bytes' => File.size(path) } }
          manifest_path = File.join(work, 'manifest.json')
          File.write(manifest_path, JSON.generate(manifest), mode: 'w', perm: 0600)
          archive = File.join(work, 'bundle.tar')
          File.open(archive, 'wb', 0600) do |io|
            Gem::Package::TarWriter.new(io) do |tar|
              files.merge('manifest.json' => manifest_path).each do |entry, path|
                tar.add_file_simple(entry, 0600, File.size(path)) { |stream| File.open(path, 'rb') { |source| IO.copy_stream(source, stream) } }
              end
            end
          end
          encrypted = File.join(root, "#{name}.tar.gpg")
          begin
            Dir.mkdir(File.join(work, 'gnupg'), 0700)
            command('gpg', '--batch', '--no-options', '--homedir', File.join(work, 'gnupg'), '--trust-model', 'always',
              '--recipient-file', public_key, '--output', encrypted + '.partial', '--encrypt', archive)
            File.chmod(0600, encrypted + '.partial')
            File.rename(encrypted + '.partial', encrypted)
            receipt = { 'format' => 1, 'kind' => 'backup', 'started_at' => started.iso8601, 'completed_at' => Time.now.utc.iso8601,
              'file' => File.basename(encrypted), 'bytes' => File.size(encrypted), 'sha256' => Digest::SHA256.file(encrypted).hexdigest,
              'database_fingerprint' => manifest['database_fingerprint'], 'migration_versions' => manifest['migration_versions'],
              'app_revision' => revision, 'keyset_id' => keyset, 'offsite_verified' => false }
            unless @env['BACKUP_LOCAL_ONLY'] == 'true'
              receipt.merge!(upload(encrypted, receipt))
              publish_receipt(receipt, work)
            end
            atomic_json(File.join(root, "#{name}.json"), receipt)
            atomic_json(File.join(root, 'latest.json'), receipt)
            prune(root) if receipt['offsite_verified']
            @out.puts JSON.generate(receipt)
            receipt
          ensure
            FileUtils.rm_f(encrypted + '.partial') if encrypted
          end
        end
      end
    end

    def aws(*args)
      JSON.parse(command('aws', '--no-cli-pager', 's3api', *args, '--output', 'json'))
    end

    def remote_config
      bucket = required('BACKUP_S3_BUCKET')
      prefix = required('BACKUP_S3_PREFIX').delete_suffix('/')
      owner = required('BACKUP_S3_EXPECTED_OWNER')
      raise Error, 'Invalid backup bucket, owner or prefix.' unless bucket.match?(/\A[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]\z/) && owner.match?(/\A\d{12}\z/) && prefix.match?(/\A[a-zA-Z0-9][a-zA-Z0-9_\/-]*\z/) && !prefix.split('/').include?('..')
      [bucket, prefix, owner]
    end

    def upload(path, receipt)
      raise Error, 'Single-object backups must be smaller than 5 GiB; use a managed multipart/PITR solution for larger databases.' if File.size(path) >= MAX_OBJECT_BYTES
      bucket, prefix, owner = remote_config
      common = ['--bucket', bucket, '--expected-bucket-owner', owner]
      raise Error, 'Offsite bucket versioning is required.' unless aws('get-bucket-versioning', *common)['Status'] == 'Enabled'
      lock = aws('get-object-lock-configuration', *common)
      raise Error, 'Offsite bucket Object Lock is required.' unless lock.dig('ObjectLockConfiguration', 'ObjectLockEnabled') == 'Enabled'
      retention = Integer(@env.fetch('BACKUP_OFFSITE_RETENTION_DAYS', '35'))
      raise Error, 'Offsite retention must be between 7 and 365 days.' unless retention.between?(7, 365)
      key = "#{prefix}/#{File.basename(path)}"
      checksum = Base64.strict_encode64([receipt.fetch('sha256')].pack('H*'))
      uploaded = aws('put-object', *common, '--key', key, '--body', path, '--checksum-algorithm', 'SHA256', '--checksum-sha256', checksum,
        '--server-side-encryption', 'aws:kms', '--ssekms-key-id', required('BACKUP_S3_KMS_KEY_ID'),
        '--object-lock-mode', 'COMPLIANCE', '--object-lock-retain-until-date', (Time.now.utc + retention * 86400).iso8601)
      version = uploaded['VersionId']
      raise Error, 'S3 did not confirm version and checksum.' if version.to_s.empty? || version == 'null' || uploaded['ChecksumSHA256'] != checksum
      head = aws('head-object', *common, '--key', key, '--version-id', version)
      raise Error, 'Offsite object verification failed.' unless head['ContentLength'] == receipt['bytes'] && head['ObjectLockMode'] == 'COMPLIANCE'
      { 'offsite_verified' => true, 'bucket' => bucket, 'key' => key, 'version_id' => version, 'expected_owner' => owner }
    end

    def publish_receipt(receipt, work)
      bucket, prefix, owner = remote_config
      key = "#{prefix}/#{receipt.fetch('file')}.receipt.json"
      receipt['receipt_key'] = key
      path = File.join(work, 'receipt.json')
      atomic_json(path, receipt)
      checksum = Base64.strict_encode64(Digest::SHA256.file(path).digest)
      uploaded = aws('put-object', '--bucket', bucket, '--expected-bucket-owner', owner,
        '--key', key, '--body', path, '--checksum-algorithm', 'SHA256', '--checksum-sha256', checksum,
        '--server-side-encryption', 'aws:kms', '--ssekms-key-id', required('BACKUP_S3_KMS_KEY_ID'),
        '--object-lock-mode', 'COMPLIANCE', '--object-lock-retain-until-date', (Time.now.utc + Integer(@env.fetch('BACKUP_OFFSITE_RETENTION_DAYS', '35')) * 86400).iso8601)
      version = uploaded['VersionId']
      raise Error, 'Offsite recovery receipt checksum/version not confirmed.' if version.to_s.empty? || version == 'null' || uploaded['ChecksumSHA256'] != checksum
      head = aws('head-object', '--bucket', bucket, '--expected-bucket-owner', owner, '--key', key, '--version-id', version)
      raise Error, 'Offsite recovery receipt verification failed.' unless head['ContentLength'] == File.size(path) && head['ObjectLockMode'] == 'COMPLIANCE'
      receipt['receipt_version_id'] = version
    end

    def read_receipt(path)
      raise Error, 'Receipt must be a regular file.' unless File.file?(path) && !File.symlink?(path) && File.size(path) < 1_000_000
      value = JSON.parse(File.read(path))
      raise Error, 'Invalid backup receipt.' unless value['format'] == 1 && value['kind'] == 'backup' && value['sha256'].to_s.match?(/\A[0-9a-f]{64}\z/)
      value
    end

    def check(path, maximum_age: 26 * 3600, values: nil)
      receipt = read_receipt(path)
      age = Time.now - Time.iso8601(receipt.fetch('started_at'))
      raise Error, 'No fresh verified offsite backup; do not migrate or prune.' unless receipt['offsite_verified'] == true && age.between?(0, maximum_age)
      raise Error, 'Backup belongs to a different database.' if values && receipt['database_fingerprint'] != fingerprint(values)
      receipt
    end

    def restore(receipt_path, local_file: nil)
      receipt = read_receipt(receipt_path)
      values = database_env('RESTORE_DATABASE_URL')
      database = values.fetch('PGDATABASE')
      raise Error, 'Restore destination must be a NEW disposable database named *_restore_<id>.' unless database.match?(/\A[a-z][a-z0-9_]*_restore_[a-z0-9]+\z/)
      raise Error, 'Source and restore databases must differ.' if receipt['database_fingerprint'] == fingerprint(values)
      raise Error, 'Set RESTORE_CONFIRM_DATABASE to the exact disposable database name.' unless @env['RESTORE_CONFIRM_DATABASE'] == database
      destination = File.expand_path(required('RESTORE_UPLOAD_DESTINATION'))
      raise Error, 'Restore upload destination must not already exist.' if File.exist?(destination) || File.symlink?(destination)
      started = Time.now.utc
      report_path = File.expand_path(required('RESTORE_REPORT_PATH'))
      raise Error, 'Restore report must not overwrite an existing file.' if File.exist?(report_path)
      report = { 'kind' => 'restore_drill', 'started_at' => started.iso8601, 'source_sha256' => receipt['sha256'], 'destination_database' => database, 'verified' => false }
      Dir.mktmpdir('nexus-restore-', @env['RESTORE_WORK_DIRECTORY']) do |work|
        encrypted = local_file || File.join(work, 'backup.tar.gpg')
        unless local_file
          bucket, _prefix, owner = remote_config
          raise Error, 'Receipt must reference the configured offsite bucket and owner.' unless receipt['offsite_verified'] && receipt['bucket'] == bucket && receipt['expected_owner'] == owner
          raise Error, 'Invalid offsite object key.' unless receipt['key'].to_s.start_with?(required('BACKUP_S3_PREFIX').delete_suffix('/') + '/') && !receipt['version_id'].to_s.empty?
          aws('get-object', '--bucket', bucket, '--expected-bucket-owner', owner, '--key', receipt.fetch('key'), '--version-id', receipt.fetch('version_id'), encrypted)
        end
        raise Error, 'Encrypted backup checksum mismatch.' unless File.size(encrypted) == receipt['bytes'] && Digest::SHA256.file(encrypted).hexdigest == receipt['sha256']
        home = File.join(work, 'gnupg')
        Dir.mkdir(home, 0700)
        command('gpg', '--batch', '--no-options', '--homedir', home, '--import', required('RESTORE_PRIVATE_KEY_FILE'))
        options = @env['RESTORE_PASSPHRASE_FILE'].to_s.empty? ? [] : ['--pinentry-mode', 'loopback', '--passphrase-file', @env['RESTORE_PASSPHRASE_FILE']]
        archive = File.join(work, 'bundle.tar')
        begin
          max_output = Integer(@env.fetch('RESTORE_MAX_BYTES', (100 * 1024**3).to_s)) * 2 + 1024**2
          command('gpg', '--batch', '--no-options', '--homedir', home, *options, '--max-output', max_output.to_s, '--output', archive, '--decrypt', encrypted)
        ensure
          command('gpgconf', '--homedir', home, '--kill', 'gpg-agent')
        end
        extracted = File.join(work, 'extracted')
        Dir.mkdir(extracted, 0700)
        extract(archive, extracted)
        manifest = JSON.parse(File.read(File.join(extracted, 'manifest.json')))
        raise Error, 'Unsupported backup format.' unless manifest['format'] == 1
        raise Error, 'Receipt and encrypted manifest do not match.' unless %w[database_fingerprint migration_versions app_revision keyset_id].all? { |key| manifest[key] == receipt[key] }
        actual_files = Dir.glob(File.join(extracted, '**', '*'), File::FNM_DOTMATCH).select { |path| File.file?(path) }.map { |path| path.delete_prefix(extracted + '/') }.sort
        raise Error, 'Backup file inventory mismatch.' unless actual_files == (manifest.fetch('files').keys + ['manifest.json']).sort
        manifest['files'].each do |name, expected|
          path = File.join(extracted, name)
          raise Error, 'Backup payload checksum mismatch.' unless File.size(path) == expected['bytes'] && Digest::SHA256.file(path).hexdigest == expected['sha256']
        end
        # createdb fails if the destination exists. There is deliberately no drop,
        # force, --create restore, or automatic retry into an existing database.
        command('createdb', '--maintenance-db=postgres', '--template=template0', database, env: values.merge('PGDATABASE' => 'postgres'))
        command('pg_restore', '--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '--clean', '--if-exists', '--dbname', database, File.join(extracted, 'database.dump'), env: values)
        connection = connect(values)
        begin
          # Recovered media is isolated on disk; never reuse source provider
          # credentials or let a drill read/purge production objects.
          connection.exec("UPDATE active_storage_blobs SET service_name = 'local'") if manifest['uploads_mode'] == 'active_storage'
          actual = inventory(connection)
          raise Error, 'Restored table counts or migration versions differ.' unless actual['table_counts'] == manifest['table_counts'] && actual['migration_versions'] == manifest['migration_versions']
        ensure
          connection.close
        end
        FileUtils.mkdir_p(File.dirname(destination), mode: 0700)
        if %w[local active_storage].include?(manifest['uploads_mode'])
          FileUtils.mv(File.join(extracted, 'uploads'), destination) if File.directory?(File.join(extracted, 'uploads'))
          FileUtils.mkdir_p(destination, mode: 0700)
        end
        report.merge!('verified' => true, 'completed_at' => Time.now.utc.iso8601, 'elapsed_seconds' => (Time.now - started).round(2),
          'tables_verified' => actual['table_counts'].size, 'files_verified' => manifest['files'].size - 1,
          'uploads_mode' => manifest['uploads_mode'], 'upload_recovery_reference' => manifest['upload_recovery_reference'],
          'external_upload_recovery_verified' => false, 'application_checks_verified' => false,
          'keyset_id' => manifest['keyset_id'], 'app_revision' => manifest['app_revision'])
        atomic_json(report_path, report)
        @out.puts JSON.generate(report)
        report
      end
    rescue StandardError
      atomic_json(report_path, report.merge('failed_at' => Time.now.utc.iso8601)) if report_path && report
      raise
    end

    def extract(archive, destination)
      total = 0
      maximum = Integer(@env.fetch('RESTORE_MAX_BYTES', (100 * 1024**3).to_s))
      seen = {}
      File.open(archive, 'rb') do |io|
        Gem::Package::TarReader.new(io) do |tar|
          tar.each do |entry|
            name = entry.full_name
            allowed = name == 'manifest.json' || name == 'database.dump' || (name.start_with?('uploads/') && name.split('/').none? { |piece| piece.empty? || %w[. ..].include?(piece) })
            raise Error, 'Unsafe or duplicate backup archive entry.' unless allowed && entry.file? && !seen[name] && !name.include?("\0") && !name.include?('\\')
            seen[name] = true
            total += entry.header.size
            raise Error, 'Restore exceeds configured extraction limit.' if total > maximum
            path = File.join(destination, name)
            FileUtils.mkdir_p(File.dirname(path), mode: 0700)
            File.open(path, File::WRONLY | File::CREAT | File::EXCL, 0600) { |target| IO.copy_stream(entry, target) }
          end
        end
      end
    end

    def atomic_json(path, value)
      temporary = "#{path}.#{SecureRandom.hex(6)}.partial"
      File.open(temporary, File::WRONLY | File::CREAT | File::EXCL, 0600) { |file| file.write(JSON.pretty_generate(value) + "\n"); file.flush; file.fsync }
      File.rename(temporary, path)
    ensure
      FileUtils.rm_f(temporary) if temporary
    end

    def prune(root)
      days = Integer(@env.fetch('BACKUP_LOCAL_RETENTION_DAYS', '14'))
      raise Error, 'Local retention must be between 1 and 365 days.' unless days.between?(1, 365)
      Dir.glob(File.join(root, 'nexus-*.json')).each do |path|
        next unless File.mtime(path) < Time.now - days * 86400
        old = read_receipt(path)
        next unless old['offsite_verified'] && old['file'].to_s.match?(/\Anexus-[a-zA-Z0-9-]+\.tar\.gpg\z/)
        FileUtils.rm_f(File.join(root, old['file']))
        FileUtils.rm_f(path)
      end
    end
  end
end
