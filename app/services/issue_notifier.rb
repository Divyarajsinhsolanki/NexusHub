require "net/http"
require "uri"

class IssueNotifier
  def initialize(issue, previous_status:, previous_assignee:)
    @issue = issue
    @previous_status = previous_status
    @previous_assignee = previous_assignee
  end

  SLACK_MAX_RETRIES = 3

  def notify
    send_email if email_targets.any?

    return unless slack_webhook.present?

    send_slack
  end

  private

  attr_reader :issue, :previous_status, :previous_assignee

  def email_targets
    @email_targets ||= [issue.assignee_email, issue.owner_email].compact_blank.uniq
  end

  def send_email
    IssueMailer.issue_update(
      issue,
      previous_status: previous_status,
      previous_assignee: previous_assignee,
      targets: email_targets
    ).deliver_later
  end

  def send_slack
    payload = {
      text: ["Issue #{issue.issue_key || issue.id}: #{issue.title}", issue.assignee_slack.presence].compact.join(" "),
      attachments: [
        {
          color: status_color(issue.status),
          fields: [
            { title: "Status", value: status_line, short: true },
            { title: "Assignee", value: assignee_line, short: true },
            { title: "Due date", value: due_date_line, short: true },
          ]
        }
      ]
    }

    uri = URI(slack_webhook)

    with_slack_retries do
      request = Net::HTTP::Post.new(uri)
      request["Content-Type"] = "application/json"
      request.body = payload.to_json
      response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 10) { |http| http.request(request) }
      next if response.is_a?(Net::HTTPSuccess)

      raise "Slack webhook delivery failed (HTTP #{response.code.to_i})."
    end
  end

  def with_slack_retries
    attempts = 0

    begin
      attempts += 1
      yield
    rescue StandardError => e
      if attempts < SLACK_MAX_RETRIES
        sleep(0.2 * attempts)
        retry
      end

      AppEventLogger.error(
        :application_errors,
        source: self.class.name,
        message: "IssueNotifier Slack delivery failed",
        exception: e,
        payload: { issue_id: issue.id, issue_key: issue.issue_key }
      )
      raise
    end
  end

  def status_line
    return issue.status unless previous_status.present? && previous_status != issue.status

    "#{previous_status} → #{issue.status}"
  end

  def assignee_line
    current = issue.assignee.presence || "Unassigned"
    return current unless previous_assignee.present? && previous_assignee != issue.assignee

    "#{previous_assignee} → #{current}"
  end

  def due_date_line
    issue.due_date&.strftime("%Y-%m-%d") || "Not set"
  end

  def slack_webhook
    return @slack_webhook if defined?(@slack_webhook)
    connection = WorkspaceIntegration.in_workspace(issue.workspace).find_by(provider: "slack", revoked_at: nil)
    @slack_webhook = connection&.secret
  rescue Integrations::SecretBox::Unavailable
    AppEventLogger.warn(:application_errors, source: self.class.name, message: "Workspace Slack credential unavailable", payload: { workspace_id: issue.workspace_id })
    @slack_webhook = nil
  end

  def status_color(status)
    {
      "New" => "#0ea5e9",
      "In Progress" => "#f59e0b",
      "Blocked" => "#ef4444",
      "Resolved" => "#10b981"
    }[status] || "#94a3b8"
  end
end
