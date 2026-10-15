module PrivateFiles
  module AttachmentGuard
    def find_or_build_blob
      if attachable.is_a?(String)
        blob = ActiveStorage::Blob.find_signed!(attachable)
        owner = Current.user
        reserved = blob.metadata["mobile_upload"]
        owned = owner&.workspace_access? && blob.metadata["uploaded_by_user_id"].to_i == owner.id &&
          blob.metadata["workspace_id"].to_i == owner.workspace_id && blob.metadata["upload_verified"] == true
        permitted = reserved ? owned : PrivateFiles::Access.allowed?(blob, owner)
        raise ActiveRecord::RecordNotFound, "Upload is unavailable" unless permitted
      end
      super.tap do |blob|
        raise PrivateFiles::InvalidUpload, "Files must be 100MB or smaller" if blob.byte_size > 100.megabytes
      end
    rescue ActiveSupport::MessageVerifier::InvalidSignature
      raise ActiveRecord::RecordNotFound, "Upload is unavailable"
    end
  end
end
