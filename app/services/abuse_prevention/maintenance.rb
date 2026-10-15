module AbusePrevention
  class Maintenance
    BATCH_SIZE = 500

    def self.expire_pdf_queue!
      PdfDocumentOperation.unscoped.where(status: "queued").where("created_at < ?", 1.hour.ago)
        .order(:id).limit(BATCH_SIZE).each do |operation|
        operation.with_lock do
          next unless operation.status == "queued" && operation.created_at < 1.hour.ago
          operation.update!(status: "failed", progress: 100, completed_at: Time.current, error_message: "Queued operation expired. Please retry.")
        end
        PdfDocuments::Sources.release!(operation)
      end
    end

    def self.purge_abandoned_uploads!
      ActiveStorage::Blob.unattached.where("active_storage_blobs.created_at < ?", 24.hours.ago)
        .order(:id).limit(BATCH_SIZE).each(&:purge_later)
    end
  end
end
