class PdfDocumentOperationJob < ApplicationJob
  queue_as :pdf

  def perform(operation_id)
    operation = PdfDocumentOperation.unscoped.find_by(id: operation_id)
    return unless operation
    unless operation.user.workspace_access?(operation.workspace)
      operation.update!(status: "failed", progress: 100, completed_at: Time.current, error_message: "Workspace access removed") if operation.status.in?(%w[queued processing])
      return
    end
    Current.user = operation.user
    Current.workspace = operation.workspace
    PdfDocuments::Execution.operation(operation, defer_when_busy: true)
  rescue AbusePrevention::LimitExceeded
    self.class.set(wait: 30.seconds).perform_later(operation_id)
  rescue PdfDocumentOperation::LostProcessingLease
    # A newer worker owns publication; the old delivery is safe to acknowledge.
    nil
  ensure
    begin
      latest = PdfDocumentOperation.unscoped.find_by(id: operation_id)
      if latest&.status == "processing"
        # A retry/watchdog may arrive while a healthy worker has renewed its lease.
        # Reschedule rather than acknowledge the only remaining recovery delivery.
        self.class.set(wait_until: [latest.processing_lease_expires_at, 1.second.from_now].max).perform_later(latest.id)
      end
    ensure
      Current.reset_all
    end
  end
end
