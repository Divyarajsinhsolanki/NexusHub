ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"
require_relative "support/security_reporter" if ENV["SECURITY_REGRESSION_RUN"] == "1"
require "prawn"
require "tempfile"

class ActiveSupport::TestCase
  parallelize(workers: 1)

  setup do
    Current.reset_all
    Role::NAMES.each { |name| Role.find_or_create_by!(name: name) }
  end

  teardown do
    Current.reset_all
  end
end

module PdfTestHelper
  def create_test_pdf(text: "PDF test document", pages: 2)
    file = Tempfile.new(["pdf-test-", ".pdf"])
    Prawn::Document.generate(file.path) do |pdf|
      pages.times do |index|
        pdf.start_new_page unless index.zero?
        pdf.text("#{text} page #{index + 1}")
      end
    end
    file
  end

  def create_test_user(workspace:, email:)
    workspace.users.create!(
      email:,
      password: "Password!42",
      password_confirmation: "Password!42",
      first_name: "PDF",
      last_name: "Tester",
      job_title: "Engineer",
      status: "active",
      confirmed_at: Time.current
    )
  end
end

ActiveSupport::TestCase.include(PdfTestHelper)

module MfaIntegrationFixture
  # Regression fixtures complete MFA through the same public endpoints as users.
  # Preserve the primary-login response for existing credential assertions.
  def enroll_test_mfa(user, headers: {}, native: false)
    prefix = native ? "/api/v1/mfa" : "/api/mfa"
    if user.reload.mfa_enabled_at
      travel 31.seconds if user.mfa_last_otp_at && Time.current.to_i <= user.mfa_last_otp_at + 30
      post "#{prefix}/verify", params: { otp_code: ROTP::TOTP.new(PrivilegedMfa.secret(user)).now }, headers: headers
    else
      post "#{prefix}/setup", params: { password: "Password!42" }, headers: headers
      assert_response :success
      secret = native ? response.parsed_body.dig("data", "secret") : response.parsed_body["secret"]
      post "#{prefix}/confirm", params: { otp_code: ROTP::TOTP.new(secret).now }, headers: headers
    end
    assert_response :success
  end

  def complete_test_mfa(native: false)
    return unless response.successful?
    original = @response
    payload = response.parsed_body
    user_payload = native ? payload.dig("data", "user") : payload["user"]
    return unless user_payload && (user_payload.dig("mfa", "required") || user_payload.dig("mfa", "enabled"))
    user = User.find(user_payload["id"])
    prefix = native ? "/api/v1/mfa" : "/api/mfa"
    headers = native ? { "Authorization" => "Bearer #{payload.dig("data", "access_token")}" } : {}
    if user.mfa_enabled_at
      travel 31.seconds if user.mfa_last_otp_at && Time.current.to_i <= user.mfa_last_otp_at + 30
      post "#{prefix}/verify", params: { otp_code: ROTP::TOTP.new(PrivilegedMfa.secret(user)).now }, headers: headers
    else
      post "#{prefix}/setup", headers: headers
      assert_response :success
      secret = native ? response.parsed_body.dig("data", "secret") : response.parsed_body["secret"]
      post "#{prefix}/confirm", params: { otp_code: ROTP::TOTP.new(secret).now }, headers: headers
    end
    assert_response :success
  ensure
    if original
      @response = original
      integration_session.instance_variable_set(:@response, original)
    end
  end
end
ActionDispatch::IntegrationTest.include(MfaIntegrationFixture)
