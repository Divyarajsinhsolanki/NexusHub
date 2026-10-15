class KnowledgeBookmarkReminderJob < ApplicationJob
  queue_as :default

  def perform
    KnowledgeBookmark.unscoped.due_for_reminder.includes(:user, :workspace).find_each do |bookmark|
      next unless bookmark.user.workspace_access?(bookmark.workspace)
      next if bookmark.user.email.blank?
      next if bookmark.workspace.demo?

      Current.set(workspace: bookmark.workspace) do
        KnowledgeBookmarkMailer.reminder(bookmark).deliver_later
        bookmark.schedule_next_reminder!
      end
    end
  end
end
