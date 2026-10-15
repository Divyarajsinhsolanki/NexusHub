# Standalone tests. Only generated databases named *_restore_<id> or
# recovery_fixture_<id> are created; existing application databases are never changed.
require 'minitest/autorun'
require 'stringio'
require_relative '../../lib/recovery/toolkit'
require_relative '../../lib/recovery/deployment_safety'

class RecoveryToolkitTest < Minitest::Test
  def setup
    @directory = Dir.mktmpdir('recovery-test-')
    @env = { 'BACKUP_DIRECTORY' => File.join(@directory, 'backups'), 'APP_REVISION' => 'synthetic-fixture',
      'BACKUP_KEYSET_ID' => 'fixture-keyset', 'BACKUP_UPLOAD_MODE' => 'local', 'BACKUP_WRITES_QUIESCED' => 'true',
      'BACKUP_UPLOAD_ROOT' => File.join(@directory, 'files'), 'BACKUP_LOCAL_ONLY' => 'true' }
    FileUtils.mkdir_p(@env['BACKUP_UPLOAD_ROOT'])
    File.binwrite(File.join(@env['BACKUP_UPLOAD_ROOT'], 'sample.pdf'), "%PDF-fixture\x00private bytes")
    @tool = Recovery::Toolkit.new(@env, out: StringIO.new)
  end

  def teardown
    if @admin
      [@source_name, @restore_name].compact.each do |name|
        @admin.exec_params('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [name])
        @admin.exec("DROP DATABASE IF EXISTS #{PG::Connection.quote_ident(name)}")
      end
      @admin.close
    end
    FileUtils.remove_entry(@directory)
  end

  def test_receipt_checks_reject_unverified_stale_and_other_database
    path = File.join(@directory, 'receipt.json')
    value = { 'format' => 1, 'kind' => 'backup', 'sha256' => 'a' * 64, 'started_at' => Time.now.utc.iso8601, 'offsite_verified' => false }
    @tool.atomic_json(path, value)
    assert_raises(Recovery::Error) { @tool.check(path) }
    value['offsite_verified'] = true
    @tool.atomic_json(path, value)
    assert @tool.check(path)
    assert_raises(Recovery::Error) { @tool.check(path, values: { 'PGHOST' => 'other', 'PGDATABASE' => 'other' }) }
    value['started_at'] = (Time.now.utc - 27 * 3600).iso8601
    @tool.atomic_json(path, value)
    assert_raises(Recovery::Error) { @tool.check(path) }
  end

  def test_archive_rejects_traversal_symlinks_duplicates_and_size_overflow
    [ ['uploads/../../escape', :file], ['uploads/link', :symlink], ['uploads/file', :duplicate] ].each do |name, type|
      path = File.join(@directory, 'unsafe.tar')
      File.open(path, 'wb') do |io|
        Gem::Package::TarWriter.new(io) do |tar|
          if type == :symlink
            tar.add_symlink(name, '/etc/passwd', 0600)
          else
            tar.add_file_simple(name, 0600, 1) { |entry| entry.write('x') }
            tar.add_file_simple(name, 0600, 1) { |entry| entry.write('x') } if type == :duplicate
          end
        end
      end
      target = File.join(@directory, SecureRandom.hex(4)); Dir.mkdir(target)
      assert_raises(Recovery::Error) { @tool.extract(path, target) }
    end
    @env['RESTORE_MAX_BYTES'] = '0'
    target = File.join(@directory, 'bounded'); Dir.mkdir(target)
    assert_raises(Recovery::Error) { @tool.extract(File.join(@directory, 'unsafe.tar'), target) }
  end

  def test_restore_refuses_production_existing_upload_directory_and_missing_confirmation_before_commands
    path = File.join(@directory, 'receipt.json')
    @tool.atomic_json(path, { 'format' => 1, 'kind' => 'backup', 'sha256' => 'a' * 64 })
    @env['RESTORE_DATABASE_URL'] = 'postgres://user:password@localhost/production'
    assert_raises(Recovery::Error) { @tool.restore(path, local_file: '/missing') }
    @env['RESTORE_DATABASE_URL'] = 'postgres://user:password@localhost/nexus_restore_guard'
    assert_raises(Recovery::Error) { @tool.restore(path, local_file: '/missing') }
    @env['RESTORE_CONFIRM_DATABASE'] = 'nexus_restore_guard'
    @env['RESTORE_UPLOAD_DESTINATION'] = @directory
    assert_raises(Recovery::Error) { @tool.restore(path, local_file: '/missing') }
  end

  def test_offsite_upload_requires_versioning_lock_and_round_trip_metadata
    file = File.join(@directory, 'encrypted.gpg'); File.write(file, 'encrypted bytes')
    @env.merge!('BACKUP_S3_BUCKET' => 'offsite-fixture', 'BACKUP_S3_PREFIX' => 'nexus/production', 'BACKUP_S3_EXPECTED_OWNER' => '123456789012', 'BACKUP_S3_KMS_KEY_ID' => 'fixture-kms')
    receipt = { 'sha256' => Digest::SHA256.file(file).hexdigest, 'bytes' => File.size(file) }
    replies = [ { 'Status' => 'Suspended' } ]
    @tool.define_singleton_method(:aws) { |*_| replies.shift }
    assert_raises(Recovery::Error) { @tool.upload(file, receipt) }
    replies.replace([{ 'Status' => 'Enabled' }, { 'ObjectLockConfiguration' => { 'ObjectLockEnabled' => 'Enabled' } }, { 'VersionId' => 'version-1', 'ChecksumSHA256' => Base64.strict_encode64([receipt['sha256']].pack('H*')) }, { 'ContentLength' => receipt['bytes'], 'ObjectLockMode' => 'COMPLIANCE' }])
    result = @tool.upload(file, receipt)
    assert result['offsite_verified']
    assert_equal 'version-1', result['version_id']
    assert_empty replies
  end

  def test_nonproduction_safety_requires_separate_resources_and_captured_email
    env = { 'DEPLOYMENT_TIER' => 'staging', 'DATABASE_URL' => 'postgres://localhost/nexus_staging', 'REDIS_URL' => 'redis://isolated/2',
      'NONPRODUCTION_ISOLATION_CONFIRMED' => 'true', 'ACTIVE_STORAGE_SERVICE' => 'local', 'EMAIL_DELIVERY_METHOD' => 'smtp',
      'SMTP_ADDRESS' => 'mailpit', 'MAILER_SENDER' => 'nexus@staging.invalid', 'BASE_URL' => 'https://nexus-staging.localhost',
      'INTEGRATION_ENCRYPTION_KEYS' => { 'v1' => 'a' * 64 }.to_json, 'PROJECT_OPERATIONS_ENCRYPTION_KEY' => 'b' * 64,
      'SECRET_KEY_BASE' => 'c' * 64, 'DEVISE_JWT_SECRET_KEY' => 'd' * 64 }
    Recovery::DeploymentSafety.validate!(env)
    assert_raises(RuntimeError) { Recovery::DeploymentSafety.validate!(env.merge('DATABASE_URL' => 'postgres://localhost/nexus_production')) }
    assert_raises(RuntimeError) { Recovery::DeploymentSafety.validate!(env.merge('STRIPE_SECRET_KEY' => 'live-key')) }
    assert_raises(RuntimeError) { Recovery::DeploymentSafety.validate!(env.merge('SMTP_ADDRESS' => 'smtp.real.test')) }
  end

  def test_real_encrypted_backup_restore_with_files_counts_sequences_and_corruption_detection
    skip 'Set RECOVERY_TEST_DATABASE_URL for the real isolated PostgreSQL drill' unless ENV['RECOVERY_TEST_DATABASE_URL']
    configure_database
    generate_keys
    receipt = @tool.backup
    assert_equal false, receipt['offsite_verified']
    encrypted = File.join(@env['BACKUP_DIRECTORY'], receipt['file'])
    refute_includes File.binread(encrypted), 'private fixture value'
    @env.merge!('RESTORE_DATABASE_URL' => @restore_url, 'RESTORE_CONFIRM_DATABASE' => @restore_name,
      'RESTORE_PRIVATE_KEY_FILE' => File.join(@directory, 'private.asc'), 'RESTORE_UPLOAD_DESTINATION' => File.join(@directory, 'restored-files'),
      'RESTORE_REPORT_PATH' => File.join(@directory, 'report.json'))
    receipt_path = File.join(@env['BACKUP_DIRECTORY'], 'latest.json')
    report = @tool.restore(receipt_path, local_file: encrypted)
    assert report['verified']
    assert_equal 2, report['tables_verified']
    assert_equal File.binread(File.join(@env['BACKUP_UPLOAD_ROOT'], 'sample.pdf')), File.binread(File.join(@env['RESTORE_UPLOAD_DESTINATION'], 'sample.pdf'))
    connection = @tool.connect(@tool.database_env('RESTORE_DATABASE_URL'))
    assert_equal 'private fixture value', connection.exec('SELECT value FROM recovery_records').getvalue(0, 0)
    assert_equal '2', connection.exec("INSERT INTO recovery_records(value) VALUES ('new') RETURNING id").getvalue(0, 0)
    connection.close
    # Even an explicit confirmation cannot overwrite a populated database.
    @env['RESTORE_UPLOAD_DESTINATION'] = File.join(@directory, 'second-files')
    @env['RESTORE_REPORT_PATH'] = File.join(@directory, 'second-report.json')
    assert_raises(Recovery::Error) { @tool.restore(receipt_path, local_file: encrypted) }
    File.open(encrypted, 'ab') { |file| file.write('corrupt') }
    @env['RESTORE_REPORT_PATH'] = File.join(@directory, 'corruption-report.json')
    assert_raises(Recovery::Error) { @tool.restore(receipt_path, local_file: encrypted) }
    # Exercise the offsite API contract with a local fake object store. This
    # tests remote retrieval and sidecar recovery without using an AWS account.
    cloud = fake_offsite
    @env.delete('BACKUP_LOCAL_ONLY')
    remote_receipt = @tool.backup
    assert remote_receipt['offsite_verified']
    assert cloud.key?(remote_receipt['receipt_key'])
    sidecar = JSON.parse(File.read(cloud.fetch(remote_receipt['receipt_key'])))
    assert_equal remote_receipt['version_id'], sidecar['version_id']
    assert @tool.check(receipt_path)
    @admin.exec("DROP DATABASE #{PG::Connection.quote_ident(@restore_name)}")
    @env['RESTORE_UPLOAD_DESTINATION'] = File.join(@directory, 'remote-restored-files')
    @env['RESTORE_REPORT_PATH'] = File.join(@directory, 'remote-report.json')
    assert @tool.restore(receipt_path)['verified']
    @tool.define_singleton_method(:aws) { |*_| raise Recovery::Error, 'Synthetic S3 failure' }
    assert_raises(Recovery::Error) { @tool.backup }
    assert_equal remote_receipt['sha256'], @tool.read_receipt(receipt_path)['sha256']
    assert_empty Dir.glob(File.join(@env['BACKUP_DIRECTORY'], '.backup-work-*'))
  end

  private

  def fake_offsite
    @env.merge!('BACKUP_S3_BUCKET' => 'offsite-fixture', 'BACKUP_S3_PREFIX' => 'nexus/production', 'BACKUP_S3_EXPECTED_OWNER' => '123456789012', 'BACKUP_S3_KMS_KEY_ID' => 'fixture-kms')
    cloud = {}
    root = @directory
    @tool.define_singleton_method(:aws) do |*args|
      value = ->(name) { args[args.index(name) + 1] }
      case args.first
      when 'get-bucket-versioning' then { 'Status' => 'Enabled' }
      when 'get-object-lock-configuration' then { 'ObjectLockConfiguration' => { 'ObjectLockEnabled' => 'Enabled' } }
      when 'put-object'
        path = value.call('--body')
        key = value.call('--key')
        cloud[key] = File.join(root, "cloud-#{Digest::SHA256.hexdigest(key)}")
        FileUtils.cp(path, cloud[key])
        { 'VersionId' => "version-#{cloud.size}", 'ChecksumSHA256' => Base64.strict_encode64(Digest::SHA256.file(path).digest) }
      when 'head-object'
        { 'ContentLength' => File.size(cloud.fetch(value.call('--key'))), 'ObjectLockMode' => 'COMPLIANCE' }
      when 'get-object'
        FileUtils.cp(cloud.fetch(value.call('--key')), args.last)
        {}
      else raise 'Unexpected S3 operation'
      end
    end
    cloud
  end

  def configure_database
    @env['BACKUP_DATABASE_URL'] = ENV.fetch('RECOVERY_TEST_DATABASE_URL')
    values = @tool.database_env
    @admin = @tool.connect(values.merge('PGDATABASE' => 'postgres'))
    @source_name = "recovery_fixture_#{SecureRandom.hex(6)}"
    @restore_name = "nexus_restore_#{SecureRandom.hex(6)}"
    uri = URI.parse(ENV.fetch('RECOVERY_TEST_DATABASE_URL'))
    uri.path = "/#{@source_name}"; @env['BACKUP_DATABASE_URL'] = uri.to_s
    uri.path = "/#{@restore_name}"; @restore_url = uri.to_s
    @admin.exec("CREATE DATABASE #{PG::Connection.quote_ident(@source_name)} TEMPLATE template0")
    connection = @tool.connect(@tool.database_env)
    connection.exec("CREATE TABLE recovery_records (id bigserial primary key, value text); INSERT INTO recovery_records(value) VALUES ('private fixture value'); CREATE TABLE schema_migrations(version text primary key); INSERT INTO schema_migrations VALUES ('20260101000000')")
    connection.close
  end

  def generate_keys
    home = File.join(@directory, 'keygen'); Dir.mkdir(home, 0700)
    @tool.command('gpg', '--batch', '--homedir', home, '--pinentry-mode', 'loopback', '--passphrase', '', '--quick-generate-key', 'Synthetic Recovery <recovery@example.invalid>', 'rsa2048', 'encr', '1d')
    File.write(File.join(@directory, 'public.asc'), @tool.command('gpg', '--batch', '--homedir', home, '--armor', '--export'))
    File.write(File.join(@directory, 'private.asc'), @tool.command('gpg', '--batch', '--homedir', home, '--armor', '--export-secret-keys'), perm: 0600)
    @tool.command('gpgconf', '--homedir', home, '--kill', 'gpg-agent')
    @env['BACKUP_PUBLIC_KEY_FILE'] = File.join(@directory, 'public.asc')
  end
end
