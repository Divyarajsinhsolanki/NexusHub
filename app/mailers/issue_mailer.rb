class IssueMailer < ApplicationMailer
  def issue_update(issue, previous_status:, previous_assignee:, targets:)
    return if targets.blank?

    @issue = issue
    @previous_status = previous_status
    @previous_assignee = previous_assignee

    mail(to: targets, subject: "[Issue #{issue.issue_key || issue.id}] #{issue.title}")
  end
end
