class ResourceMaintenanceJob < ApplicationJob
  queue_as :default

  def perform
    AbusePrevention::Maintenance.expire_pdf_queue!
    AbusePrevention::Maintenance.purge_abandoned_uploads!
  end
end
