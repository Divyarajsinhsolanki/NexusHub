require "test_helper"
require "minitest/mock"

class IntegrationOwnershipTest < ActiveSupport::TestCase
  setup do
    @workspace = Workspace.create!(name: "Provider isolation", slug: "provider-isolation", kind: "private")
    @other = Workspace.create!(name: "Other provider", slug: "other-provider", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "provider-owner@example.test")
    Current.user, Current.workspace = @user, @workspace
  end

  test "a global Google credential cannot authorize an unconfigured tenant" do
    Google::Auth::ServiceAccountCredentials.stub(:make_creds, ->(*) { flunk "must not read or authorize a global key" }) do
      assert_raises(Integrations::SecretBox::Unavailable) { GoogleSheetsReader.new("Tasks", "known-sheet", workspace: @other) }
    end
  end

  test "a workspace's Google key is selected explicitly even in another Current context" do
    key = OpenSSL::PKey::RSA.new(2048).private_to_pem
    value = { type: "service_account", client_email: "robot@tenant.iam.gserviceaccount.com", private_key: key }.to_json
    record = WorkspaceIntegration.create!(workspace: @workspace, provider: "google_sheets")
    record.replace_secret!(value)
    authorization = Object.new
    def authorization.fetch_access_token! = true
    captured = nil
    factory = lambda do |json_key_io:, scope:|
      captured = [JSON.parse(json_key_io.read), scope]
      authorization
    end
    Current.set(workspace: @other) do
      Google::Auth::ServiceAccountCredentials.stub(:make_creds, factory) do
        assert_same authorization, Integrations::GoogleAuthorization.call(workspace: @workspace, readonly: true)
      end
    end
    assert_equal "robot@tenant.iam.gserviceaccount.com", captured[0]["client_email"]
    assert_equal "https://www.googleapis.com/auth/spreadsheets.readonly", captured[1]
  end

  test "application Slack webhook is never a tenant fallback" do
    previous = ENV["SLACK_WEBHOOK_URL"]
    ENV["SLACK_WEBHOOK_URL"] = "https://hooks.slack.com/services/global/global/global"
    issue = Struct.new(:workspace, :workspace_id).new(@other, @other.id)
    notifier = IssueNotifier.new(issue, previous_status: nil, previous_assignee: nil)
    assert_nil notifier.send(:slack_webhook)
    record = WorkspaceIntegration.create!(workspace: @workspace, provider: "slack")
    record.replace_secret!("https://hooks.slack.com/services/T/B/tenant")
    issue.workspace, issue.workspace_id = @workspace, @workspace.id
    assert_equal "https://hooks.slack.com/services/T/B/tenant", IssueNotifier.new(issue, previous_status: nil, previous_assignee: nil).send(:slack_webhook)
  ensure
    ENV["SLACK_WEBHOOK_URL"] = previous
  end

  test "calendar Slack reminders select the event workspace and never the global webhook" do
    previous = ENV["SLACK_WEBHOOK_URL"]
    ENV["SLACK_WEBHOOK_URL"] = "https://hooks.slack.com/services/global/global/global"
    event = Struct.new(:workspace, :user, :title, :start_at).new(@other, @user, "Tenant event", Time.current)
    reminder = Struct.new(:calendar_event, :channel).new(event, "slack")
    destinations = []
    http = Object.new
    http.define_singleton_method(:request) { |_| Net::HTTPOK.new("1.1", "200", "OK") }
    start = lambda do |host, port, **_, &block|
      destinations << [host, port]
      block.call(http)
    end
    Net::HTTP.stub(:start, start) do
      EventReminderChannels::Deliverer.call(reminder)
      assert_empty destinations
      record = WorkspaceIntegration.create!(workspace: @workspace, provider: "slack")
      record.replace_secret!("https://hooks.slack.com/services/T/B/tenant")
      event.workspace = @workspace
      Current.set(workspace: @other) { EventReminderChannels::Deliverer.call(reminder) }
      assert_equal [["hooks.slack.com", 443]], destinations
    end
  ensure
    ENV["SLACK_WEBHOOK_URL"] = previous
  end
end
