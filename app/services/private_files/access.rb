module PrivateFiles
  # A signed blob ID locates bytes; it never grants permission to read them.
  class Access
    def self.public_record?(record)
      return false unless PortfolioAccess.enabled?
      case record
      when PortfolioProfile, PortfolioProject then record.published?
      when PortfolioFeature then record.published? && record.portfolio_project.published?
      else false
      end
    end

    def self.allowed?(blob, user)
      blob.attachments.any? do |attachment|
        record = attachment.record
        next false unless record
        next true if public_record?(record)
        next false unless user&.workspace_access?
        next false if record.respond_to?(:workspace_id) && record.workspace_id != user.workspace_id
        case record
        when User, Post
          record.workspace_id == user.workspace_id
        when Conversation
          record.conversation_participants.active.exists?(user_id: user.id)
        when Message
          !record.deleted_at? && record.conversation.conversation_participants.active.exists?(user_id: user.id)
        when ScheduledChatMessage
          record.user_id == user.id && record.conversation.conversation_participants.active.exists?(user_id: user.id)
        when Issue
          Project.accessible_to(user).exists?(id: record.project_id)
        when PdfDocument, PdfDocumentArtifact
          record.user_id == user.id && (!record.is_a?(PdfDocumentArtifact) || record.expires_at.future?)
        when PdfDocumentVersion, PdfDocumentEditLayer
          record.pdf_document.user_id == user.id
        when PortfolioProfile, PortfolioProject, PortfolioFeature
          user.site_admin?
        else false # New attachment types require an explicit policy.
        end
      end
    end
  end
end
