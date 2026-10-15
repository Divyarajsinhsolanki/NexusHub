class Api::V1::FileAccessController < Api::V1::BaseController
  def create
    blob = ActiveStorage::Blob.find_signed!(params.require(:signed_id))
    return head :not_found unless PrivateFiles::Access.allowed?(blob, current_user)
    url = rails_blob_path(blob, only_path: true)
    render_data({ url: "#{url}?ticket=#{ERB::Util.url_encode(PrivateFiles::Ticket.issue(blob, current_mobile_session))}", expires_in: 300 })
  rescue ActiveSupport::MessageVerifier::InvalidSignature
    head :not_found
  end
end
