# Serialize capacity checks with creates in both legacy and mobile APIs.
# Existing records remain readable/editable when a workspace exceeds a lower tier.
module SaasQuota
  extend ActiveSupport::Concern

  included do
    around_create :enforce_workspace_capacity
    around_update :enforce_workspace_capacity, if: -> { is_a?(User) && will_save_change_to_status? && status_in_database == "locked" && !locked? }
  end

  private

  def enforce_workspace_capacity
    return yield if workspace.nil? || workspace.demo?
    workspace.with_lock do
      plan = Saas::PlanCatalog.find(Saas::PlanCatalog.effective_plan_key(workspace))
      case self
      when User
        limit = workspace.seat_limit_override || plan[:seat_limit]
        used = User.where(workspace_id: workspace_id).where.not(status: "locked").count
        increment = locked? ? 0 : 1
      when Project
        limit = plan[:project_limit]
        used = Project.unscoped.where(workspace_id: workspace_id).count
        increment = 1
      when PdfDocument
        limit = plan[:pdf_document_limit]
        used = PdfDocument.unscoped.where(workspace_id: workspace_id).count
        increment = 1
      when PdfDocumentVersion
        limit = plan[:storage_limit_bytes]
        used = PdfDocumentVersion.unscoped.where(workspace_id: workspace_id).sum(:byte_size)
        increment = byte_size.to_i
      end
      if limit && used + increment > limit
        errors.add(:base, "Workspace plan capacity reached. Ask the owner to upgrade the plan.")
        raise ActiveRecord::RecordInvalid, self
      end
      yield
    end
  end
end
