module PrivateFiles
  class Ticket
    def self.issue(blob, session)
      Rails.application.message_verifier("private-file-ticket").generate(
        { "blob_id" => blob.id, "session_id" => session.id }, expires_in: 5.minutes, purpose: "download")
    end

    def self.session(token, blob)
      data = Rails.application.message_verifier("private-file-ticket").verified(token, purpose: "download")
      return unless data && data["blob_id"] == blob.id
      MobileSession.active.find_by(id: data["session_id"])
    end
  end
end
