module PdfOperationCapacity
  extend ActiveSupport::Concern
  included do
    around_create :admit_pdf_operation
  end

  private

  def admit_pdf_operation
    return yield unless status.in?(%w[queued processing])
    workspace.with_lock do
      active = PdfDocumentOperation.unscoped.where(workspace_id:, status: %w[queued processing])
      if active.count >= 12 || active.where(user_id:).count >= 3
        raise AbusePrevention::LimitExceeded, "Too many PDF operations are pending. Wait for existing operations to finish."
      end
      yield
    end
  end
end
