class Api::V1::UploadsController < Api::V1::BaseController
  MAX_UPLOAD_BYTES = 100.megabytes

  def create
    upload = params.require(:upload).permit(:filename, :byte_size, :checksum, :content_type)
    byte_size = upload[:byte_size].to_i
    return render_error(code: "invalid_upload", message: "File size must be between 1 byte and 100 MB.", status: :unprocessable_entity) unless byte_size.between?(1, MAX_UPLOAD_BYTES)

    blob = ActiveStorage::Blob.create_before_direct_upload!(
      filename: upload.require(:filename),
      byte_size: byte_size,
      checksum: upload.require(:checksum),
      content_type: upload[:content_type].presence || "application/octet-stream",
      metadata: {
        uploaded_by_user_id: current_user.id,
        workspace_id: current_user.workspace_id,
        mobile_upload: true
      }
    )

    render_data(
      {
        signed_blob_id: blob.signed_id,
        direct_upload: {
          url: blob.service_url_for_direct_upload,
          headers: blob.service_headers_for_direct_upload
        }
      },
      status: :created
    )
  end
end
