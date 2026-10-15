require "stringio"
require "googleauth"

module Integrations
  class GoogleAuthorization
    def self.call(workspace:, readonly: false)
      raise SecretBox::Unavailable, "A workspace is required for Google Sheets." unless workspace
      connection = WorkspaceIntegration.in_workspace(workspace).find_by(provider: "google_sheets")
      raise SecretBox::Unavailable, "Configure this workspace's Google Sheets connection first." unless connection
      credentials = connection.secret
      scope = readonly ? "https://www.googleapis.com/auth/spreadsheets.readonly" : "https://www.googleapis.com/auth/spreadsheets"
      Google::Auth::ServiceAccountCredentials.make_creds(json_key_io: StringIO.new(JSON.generate(credentials)), scope:).tap(&:fetch_access_token!)
    rescue SecretBox::Unavailable
      raise
    rescue StandardError
      raise SecretBox::Unavailable, "Google Sheets authorization failed. Check this workspace's connection."
    end
  end
end
