class Api::V1::UploadsController < Api::V1::BaseController
  MAX_UPLOAD_BYTES = 100.megabytes

  def create
    upload = params.require(:upload).permit(:filename, :byte_size, :checksum, :content_type)
    byte_size = upload[:byte_size].to_i
    return render_error(code: "invalid_upload", message: "File size must be between 1 byte and 100 MB.", status: :unprocessable_entity) unless byte_size.between?(1, MAX_UPLOAD_BYTES)

    unless upload[:checksum].to_s.match?(/\A[A-Za-z0-9+\/]{22}==\z/) && upload[:filename].to_s.bytesize.between?(1, 255)
      return render_error(code: "invalid_upload", message: "A filename and a base64 MD5 checksum are required.", status: :unprocessable_entity)
    end

    blob = AbusePrevention::StorageBudget.reserve!(current_user, bytes: byte_size) do
      ActiveStorage::Blob.create_before_direct_upload!(
        filename: upload.require(:filename),
        byte_size: byte_size,
        checksum: upload.require(:checksum),
        content_type: upload[:content_type].presence || "application/octet-stream",
        metadata: {
          uploaded_by_user_id: current_user.id,
          workspace_id: current_user.workspace_id,
          mobile_upload: true,
          upload_expires_at: 15.minutes.from_now.iso8601,
          upload_verified: false
        }
      )
    end

    render_data(
      {
        signed_blob_id: blob.signed_id,
        direct_upload: {
          url: "/api/v1/uploads/#{blob.signed_id}",
          headers: { "Content-Type" => "application/octet-stream" }
        }
      },
      status: :created
    )
  end

  # Upload bytes through the application, never with reusable cloud credentials.
  def update
    blob = ActiveStorage::Blob.find_signed!(params[:id])
    expires = Time.iso8601(blob.metadata.fetch("upload_expires_at")) rescue nil
    unless blob.metadata["uploaded_by_user_id"].to_i == current_user.id &&
        blob.metadata["workspace_id"].to_i == current_user.workspace_id && expires&.future? &&
        blob.metadata["mobile_upload"] == true && blob.metadata["upload_verified"] == false
      return head :not_found
    end
    return head :unprocessable_entity unless request.content_length == blob.byte_size

    Tempfile.create("private-upload", binmode: true) do |file|
      # Limit reads even when a dishonest client supplies a smaller Content-Length.
      IO.copy_stream(request.body, file, blob.byte_size + 1)
      file.flush
      return head :unprocessable_entity unless file.size == blob.byte_size
      digest = Digest::MD5.file(file.path).base64digest
      return head :unprocessable_entity unless ActiveSupport::SecurityUtils.secure_compare(digest, blob.checksum)
      file.rewind
      blob.with_lock do
        return head :conflict if blob.metadata["upload_verified"]
        blob.service.upload(blob.key, file, checksum: blob.checksum, content_type: blob.content_type)
        blob.update!(metadata: blob.metadata.merge("upload_verified" => true))
      end
    end
    render_data({ uploaded: true })
  rescue ActiveRecord::RecordNotFound, ActiveSupport::MessageVerifier::InvalidSignature
    head :not_found
  rescue ActiveStorage::IntegrityError
    head :unprocessable_entity
  end
end
