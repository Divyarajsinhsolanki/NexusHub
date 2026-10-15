require "test_helper"
require "minitest/mock"

class IntegrationSecretsTest < ActiveSupport::TestCase
  setup do
    @workspace = Workspace.create!(name: "Secret integrations", slug: "secret-integrations", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "secret-integrations@example.test")
    Current.user, Current.workspace = @user, @workspace
  end

  test "ciphertexts bind secrets to their workspace and provider and never serialize them" do
    record = WorkspaceIntegration.create!(workspace: @workspace, provider: "slack")
    value = "https://hooks.slack.com/services/T1/B2/secret-value"
    record.replace_secret!(value)
    assert_equal value, record.reload.secret
    refute_includes record.secret_ciphertext, "secret-value"
    refute_includes record.to_json, record.secret_ciphertext
    refute_includes record.public_payload.to_json, "secret-value"
    assert_raises(Integrations::SecretBox::Unavailable) do
      Integrations::SecretBox.decrypt(record.secret_ciphertext, context: "workspace-integration:v1:999:slack")
    end
    assert_raises(Integrations::SecretBox::Unavailable) do
      Integrations::SecretBox.decrypt(record.secret_ciphertext, context: "workspace-integration:v1:#{@workspace.id}:google_sheets")
    end
    record.revoke!
    assert_raises(Integrations::SecretBox::Unavailable) { record.secret }
  end

  test "old key versions remain readable during rotation and missing keys preserve ciphertext" do
    original_keys, original_id = ENV["INTEGRATION_ENCRYPTION_KEYS"], ENV["INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID"]
    ENV["INTEGRATION_ENCRYPTION_KEYS"] = { v1: "11" * 32 }.to_json
    ENV["INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID"] = "v1"
    encrypted = Integrations::SecretBox.encrypt("old-secret", context: "test")
    ENV["INTEGRATION_ENCRYPTION_KEYS"] = { v1: "11" * 32, v2: "22" * 32 }.to_json
    ENV["INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID"] = "v2"
    assert_equal "old-secret", Integrations::SecretBox.decrypt(encrypted, context: "test")
    ENV["INTEGRATION_ENCRYPTION_KEYS"] = { v2: "22" * 32 }.to_json
    assert_raises(Integrations::SecretBox::Unavailable) { Integrations::SecretBox.decrypt(encrypted, context: "test") }
    assert encrypted.present?
  ensure
    ENV["INTEGRATION_ENCRYPTION_KEYS"], ENV["INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID"] = original_keys, original_id
  end

  test "personal Keka secrets bind to destination and user and stay out of user JSON" do
    @user.update!(keka_base_url: "https://company.keka.com", keka_employee_id: "EMP1", keka_api_key: "personal-secret-token")
    assert_equal "personal-secret-token", @user.reload.keka_api_key
    assert_nil @user.encrypted_keka_api_key
    refute_includes @user.to_json, "personal-secret-token"
    refute_includes @user.to_json, "keka_secret_ciphertext"
    assert_equal "••••••••", @user.keka_api_key_masked
    @user.update!(keka_base_url: "https://other.keka.com")
    assert_raises(Integrations::SecretBox::Unavailable) { @user.reload.keka_api_key }
    assert_not @user.keka_connected?
  end

  test "invalid Google OAuth destinations and malformed private keys never reach the network" do
    data = { type: "service_account", client_email: "test@tenant.iam.gserviceaccount.com", private_key: "invalid", token_uri: "http://169.254.169.254/" }
    assert_raises(ArgumentError) { Integrations::CredentialValidation.call("google_sheets", data.to_json) }
    data[:private_key] = OpenSSL::PKey::RSA.new(2048).private_to_pem
    safe, metadata = Integrations::CredentialValidation.call("google_sheets", data.to_json)
    assert_equal "https://oauth2.googleapis.com/token", safe["token_uri"]
    refute metadata.key?("private_key")
    %w[http://hooks.slack.com/services/T/B/S https://attacker.test/services/T/B/S https://hooks.slack.com@attacker.test/services/T/B/S].each do |url|
      assert_raises(ArgumentError) { Integrations::CredentialValidation.call("slack", url) }
    end
  end

  test "legacy Keka migration clears old ciphertext only after successfully saving the protected replacement" do
    @user.update_columns(keka_base_url: "https://company.keka.com", encrypted_keka_api_key: "legacy-ciphertext",
      encrypted_keka_api_key_iv: "legacy-iv", keka_profile_data: { "echo" => "legacy-secret" })
    @user.stub(:legacy_keka_api_key, "legacy-secret") { assert @user.migrate_legacy_keka_secret! }
    assert_equal "legacy-secret", @user.reload.keka_api_key
    assert_nil @user.encrypted_keka_api_key
    assert_nil @user.encrypted_keka_api_key_iv
    refute_includes @user.keka_profile_data.to_json, "legacy-secret"
    assert_not @user.migrate_legacy_keka_secret!
  end

  test "unreadable legacy Keka data is retained for recovery" do
    @user.update_columns(encrypted_keka_api_key: "legacy-ciphertext", encrypted_keka_api_key_iv: "legacy-iv")
    @user.stub(:legacy_keka_api_key, nil) do
      assert_raises(Integrations::SecretBox::Unavailable) { @user.migrate_legacy_keka_secret! }
    end
    assert_equal "legacy-ciphertext", @user.reload.encrypted_keka_api_key
    assert_nil @user.keka_secret_ciphertext
  end
end

class SecretLoggingTest < ActiveSupport::TestCase
  test "custom event logs filter secret payloads and omit exception messages" do
    fake = Object.new
    lines = []
    fake.define_singleton_method(:error) { |message| lines << message }
    AppLoggers.stub(:fetch, fake) do
      Rails.logger.stub(:error, ->(*) {}) do
        AppEventLogger.error(:application_errors, source: "TestProvider", message: "Request failed",
          exception: RuntimeError.new("provider echoed TOP-SECRET"), payload: { api_key: "TOP-SECRET", nested: { credential: "TOP-SECRET" }, row: ["TOP-SECRET"] })
      end
    end
    refute_includes lines.join, "TOP-SECRET"
    assert_includes lines.join, "[FILTERED]"
    assert_includes lines.join, "RuntimeError"
  end
end
