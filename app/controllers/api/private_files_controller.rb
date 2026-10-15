class Api::PrivateFilesController < Api::BaseController
  include ActiveStorage::Streaming

  skip_before_action :authenticate_user!, :require_privileged_mfa!
  before_action :load_and_authorize_blob

  def show
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Vary"] = "Cookie, Authorization"
    response.headers["X-Content-Type-Options"] = "nosniff"
    # Browser-executable formats must download, even if a client requests inline.
    inline = %w[image/png image/jpeg image/gif image/webp application/pdf audio/mpeg audio/ogg video/mp4].include?(@blob.content_type)
    disposition = params[:disposition] == "attachment" || !inline ? "attachment" : "inline"
    response.headers["Accept-Ranges"] = "bytes"
    if request.headers["Range"].present?
      send_blob_byte_range_data(@blob, request.headers["Range"], disposition:)
    elsif request.head?
      response.headers["Content-Type"] = @blob.content_type_for_serving
      response.headers["Content-Length"] = @blob.byte_size.to_s
      head :ok
    else
      send_blob_stream(@blob, disposition:)
    end
  end

  private

  def authentication_user
    @ticket_user || super
  end

  def load_and_authorize_blob
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Vary"] = "Cookie, Authorization"
    response.headers["X-Content-Type-Options"] = "nosniff"
    @blob = ActiveStorage::Blob.find_signed!(params[:signed_id])
    # WorkspaceScoped records must resolve in the authenticated tenant context.
    if request.authorization.blank? && cookies[:access_token].blank? && params[:ticket].present?
      @current_mobile_session = PrivateFiles::Ticket.session(params[:ticket], @blob)
      @ticket_user = @current_mobile_session&.effective_user if @current_mobile_session&.user&.workspace_access?
    end
    @current_user = authentication_user
    Current.user = @current_user
    Current.workspace = @current_user&.workspace_access? ? @current_user.workspace : nil
    Current.membership = @current_user&.membership_for
    public_file = @blob.attachments.any? { |attachment| PrivateFiles::Access.public_record?(attachment.record) }
    unless public_file
      authenticate_user!
      return if performed?
      require_privileged_mfa!
      return if performed?
    end
    return head :not_found unless PrivateFiles::Access.allowed?(@blob, @current_user)
    AbusePrevention::RateLimiter.check!(@current_user, :files) unless public_file
  rescue ActiveSupport::MessageVerifier::InvalidSignature, ActiveRecord::RecordNotFound
    head :not_found
  end
end
