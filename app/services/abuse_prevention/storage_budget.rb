require "digest"

module AbusePrevention
  class StorageBudget
    # Explicitly scoped SQL subqueries: never depend on request Current state.
    TYPES = %w[User Post Message ScheduledChatMessage Issue PdfDocument PdfDocumentVersion PdfDocumentEditLayer PdfDocumentArtifact PdfDocumentOperation].freeze

    def self.blobs(workspace)
      attachments = TYPES.map do |type|
        ActiveStorage::Attachment.where(record_type: type, record_id: type.constantize.unscoped.where(workspace_id: workspace.id).select(:id))
      end.reduce { |left, right| left.or(right) }
      pending = ActiveStorage::Blob.where("NULLIF(metadata, '')::jsonb ->> 'workspace_id' = ? AND NULLIF(metadata, '')::jsonb ->> 'mobile_upload' = 'true'", workspace.id.to_s)
        .where("active_storage_blobs.created_at >= ?", 24.hours.ago)
        .where("NULLIF(metadata, '')::jsonb ->> 'upload_verified' = 'true' OR (NULLIF(metadata, '')::jsonb ->> 'upload_expires_at')::timestamptz > ?", Time.current)
      ActiveStorage::Blob.where(id: attachments.select(:blob_id)).or(ActiveStorage::Blob.where(id: pending.select(:id)))
    end

    # Use a dedicated transaction lock rather than locking the workspace row
    # after attachment parents: that would invert existing model lock ordering.
    def self.with_lock(workspace)
      ActiveRecord::Base.transaction do
        key = Digest::SHA256.digest("nexus:storage-budget:#{workspace.id}").unpack1("q>")
        bind = ActiveRecord::Relation::QueryAttribute.new("lock_key", key, ActiveRecord::Type::Integer.new(limit: 8))
        ActiveRecord::Base.connection.exec_query("SELECT pg_advisory_xact_lock($1)", "Storage budget lock", [bind])
        yield
      end
    end

    # Caller holds the budget lock until the reservation/attachment is persisted.
    def self.check!(workspace, bytes:, blob: nil)
      scope = blobs(workspace)
      increment = blob && scope.exists?(id: blob.id) ? 0 : bytes
      limit = Saas::PlanCatalog.find(Saas::PlanCatalog.effective_plan_key(workspace)).fetch(:storage_limit_bytes)
      if limit && increment.positive? && scope.sum(:byte_size) + increment > limit
        raise LimitExceeded.new("Workspace storage capacity reached. Remove files or ask the owner to upgrade.", retry_after: 3600)
      end
    end

    def self.reserve!(user, bytes:)
      with_lock(user.workspace) do
        scope = ActiveStorage::Blob.unattached.where("NULLIF(metadata, '')::jsonb ->> 'workspace_id' = ? AND NULLIF(metadata, '')::jsonb ->> 'mobile_upload' = 'true'", user.workspace_id.to_s)
          .where("active_storage_blobs.created_at >= ?", 24.hours.ago)
          .where("NULLIF(metadata, '')::jsonb ->> 'upload_verified' = 'true' OR (NULLIF(metadata, '')::jsonb ->> 'upload_expires_at')::timestamptz > ?", Time.current)
        owned = scope.where("NULLIF(metadata, '')::jsonb ->> 'uploaded_by_user_id' = ?", user.id.to_s)
        if owned.count >= 10 || owned.sum(:byte_size) + bytes > 250.megabytes || scope.count >= 50
          raise LimitExceeded, "Too many pending uploads. Attach existing uploads or wait for reservations to expire."
        end
        check!(user.workspace, bytes:)
        yield
      end
    end
  end
end
