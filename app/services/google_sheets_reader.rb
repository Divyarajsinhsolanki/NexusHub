require 'google/apis/sheets_v4'
require 'googleauth'

class GoogleSheetsReader
  include SheetOperationLogging

  SHEET_READ_RANGE = 'A1:ZZ'.freeze

  def initialize(sheet_name, spreadsheet_id, workspace: Current.workspace)
    @workspace = workspace
    @sheet_name = sheet_name
    @spreadsheet_id = spreadsheet_id
    @service = Google::Apis::SheetsV4::SheetsService.new
    @service.client_options.application_name = 'Rails Sheet Reader'
    @service.authorization = authorize
  end

  def read_data
    range = "#{@sheet_name}!#{SHEET_READ_RANGE}"
    ensure_spreadsheet_id!
    log_sheet_info('Sheet read started', range: range)
    response = @service.get_spreadsheet_values(@spreadsheet_id, range)
    rows = response.values || []
    log_sheet_info('Sheet read completed', range: range, row_count: rows.size)
    rows
  rescue StandardError => e
    log_sheet_error('Sheet read failed', exception: e, payload: { range: range })
    raise
  end

  private

  def authorize
    Integrations::GoogleAuthorization.call(workspace: @workspace, readonly: true)
  end

  def ensure_spreadsheet_id!
    raise ArgumentError, 'Spreadsheet ID is missing' if @spreadsheet_id.blank?

    @service.get_spreadsheet(@spreadsheet_id, fields: 'spreadsheetId')
  rescue Google::Apis::ClientError => e
    raise ArgumentError, "Spreadsheet ID is invalid or inaccessible."
  end
end
