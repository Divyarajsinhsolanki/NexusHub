require 'google/apis/sheets_v4'
require 'googleauth'

class SchedulerSheetService
  include SheetOperationLogging

  SHEET_CLEAR_RANGE = 'A:ZZ'.freeze

  def initialize(sheet_name, spreadsheet_id, workspace: Current.workspace)
    @workspace = workspace
    @sheet_name = sheet_name
    @spreadsheet_id = spreadsheet_id
    @service = Google::Apis::SheetsV4::SheetsService.new
    @service.client_options.application_name = 'Rails Scheduler Sheet'
    @service.authorization = authorize
  end

  def export_logs(logs)
    log_sheet_info('Scheduler sheet export started', log_count: logs.size)
    developers = logs.map(&:developer).uniq.sort_by(&:name)
    dates = logs.map(&:log_date).uniq.sort

    matrix = {}
    dates.each { |d| matrix[d] = Hash.new { |h, k| h[k] = [] } }

    logs.each do |log|
      matrix[log.log_date][log.developer.name] << log
    end

    values = [['Date'] + developers.map(&:name)]
    dates.each do |date|
      row = [date.to_s]
      developers.each do |dev|
        cell_logs = matrix[date][dev.name]
        row << cell_logs.map { |l| "#{l.task.task_id} (#{l.hours_logged}h) - #{l.type}" }.join("\n")
      end
      values << row
    end

    write_sheet(values)
    strike_completed_cells(matrix, developers, dates)
    log_sheet_info('Scheduler sheet export completed', log_count: logs.size, developer_count: developers.size, date_count: dates.size)
  rescue StandardError => e
    log_sheet_error('Scheduler sheet export failed', exception: e, payload: { log_count: logs.size })
    raise
  end

  private

  def authorize
    Integrations::GoogleAuthorization.call(workspace: @workspace)
  end

  def write_sheet(values)
    ensure_spreadsheet_id!
    ensure_sheet_exists!
    clear_sheet
    value_range = Google::Apis::SheetsV4::ValueRange.new(values: values)
    @service.update_spreadsheet_value(
      @spreadsheet_id,
      a1_range('A1'),
      value_range,
      value_input_option: 'RAW'
    )
  end

  def clear_sheet
    ensure_spreadsheet_id!
    ensure_sheet_exists!
    @service.clear_values(@spreadsheet_id, a1_range(SHEET_CLEAR_RANGE))
  end

  def strike_completed_cells(matrix, developers, dates)
    requests = []

    dates.each_with_index do |date, r_idx|
      developers.each_with_index do |dev, c_idx|
        logs = matrix[date][dev.name]
        next unless logs.any? { |l| l.status.to_s.downcase == 'completed' }

        requests << Google::Apis::SheetsV4::Request.new(
          repeat_cell: Google::Apis::SheetsV4::RepeatCellRequest.new(
            range: Google::Apis::SheetsV4::GridRange.new(
              sheet_id: sheet_id,
              start_row_index: r_idx + 1,
              end_row_index: r_idx + 2,
              start_column_index: c_idx + 1,
              end_column_index: c_idx + 2
            ),
            cell: Google::Apis::SheetsV4::CellData.new(
              user_entered_format: Google::Apis::SheetsV4::CellFormat.new(
                text_format: Google::Apis::SheetsV4::TextFormat.new(strikethrough: true)
              )
            ),
            fields: 'userEnteredFormat.textFormat.strikethrough'
          )
        )
      end
    end

    return if requests.empty?

    batch = Google::Apis::SheetsV4::BatchUpdateSpreadsheetRequest.new(requests: requests)
    @service.batch_update_spreadsheet(@spreadsheet_id, batch)
  end

  def sheet_id
    @sheet_id ||= begin
      ensure_spreadsheet_id!
      find_sheet_id || create_sheet!
    end
  end

  def ensure_spreadsheet_id!
    raise ArgumentError, 'Spreadsheet ID is missing' if @spreadsheet_id.blank?
  end

  def ensure_sheet_exists!
    sheet_id
  end

  def find_sheet_id
    spreadsheet = @service.get_spreadsheet(@spreadsheet_id)
    spreadsheet.sheets.find { |sheet| sheet.properties.title == @sheet_name }&.properties&.sheet_id
  end

  def create_sheet!
    request = Google::Apis::SheetsV4::BatchUpdateSpreadsheetRequest.new(
      requests: [
        Google::Apis::SheetsV4::Request.new(
          add_sheet: Google::Apis::SheetsV4::AddSheetRequest.new(
            properties: Google::Apis::SheetsV4::SheetProperties.new(title: @sheet_name)
          )
        )
      ]
    )
    response = @service.batch_update_spreadsheet(@spreadsheet_id, request)
    created_sheet_id = response.replies&.first&.add_sheet&.properties&.sheet_id
    raise StandardError, "Sheet could not be created: #{@sheet_name}" if created_sheet_id.blank?

    log_sheet_info('Scheduler sheet created', created_sheet_id: created_sheet_id)
    created_sheet_id
  rescue Google::Apis::ClientError
    existing_sheet_id = find_sheet_id
    return existing_sheet_id if existing_sheet_id.present?

    raise
  end

  def a1_range(range)
    "#{quoted_sheet_name}!#{range}"
  end

  def quoted_sheet_name
    "'#{@sheet_name.to_s.gsub("'", "''")}'"
  end
end
