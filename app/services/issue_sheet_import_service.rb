class IssueSheetImportService
  include SheetOperationLogging

  HEADER_MAP = {
    "taskcreated" => :task_id,
    "issuefoundby" => :found_by,
    "date" => :found_on,
    "module" => :module_name,
    "submodule" => :sub_module,
    "sectiondetail" => :section_detail,
    "issuedescription" => :issue_description,
    "attachment" => :attachment,
    "mf6app" => :mf6_app,
    "localqa" => :local_qa,
    "teamtestdevqa" => :team_test,
    "commentkajalteam" => :comment,
    "devcomments" => :dev_comments_dated,
    "developercomment" => :developer_comment,
    "qacomment" => :comment_qa
  }.freeze

  def initialize(project:, sheet_name:, spreadsheet_id:)
    @project = project
    @sheet_name = sheet_name
    @spreadsheet_id = spreadsheet_id
  end

  def call
    log_sheet_info('Issue sheet import started')
    rows = GoogleSheetsReader.new(@sheet_name, @spreadsheet_id, workspace: @project.workspace).read_data
    if rows.blank?
      summary = { created: 0, updated: 0, skipped: 0, total: 0 }
      log_sheet_info('Issue sheet import completed', summary: summary)
      return summary
    end

    headers = Array(rows.first).map { |h| normalize_header(h) }
    created = 0
    updated = 0
    skipped = 0

    rows.drop(1).each_with_index do |row, index|
      row_number = index + 2
      attrs = build_attrs(headers, row)
      if attrs[:issue_description].blank?
        skipped += 1
        log_sheet_warn('Issue import row skipped: missing issue description', row_number: row_number, row: summarize_sheet_row(row))
        next
      end

      issue = find_existing_issue(attrs)
      issue.assign_attributes(attrs)
      issue.title = build_title(attrs) if issue.title.blank?

      if issue.new_record?
        if issue.save
          created += 1
        else
          skipped += 1
          log_sheet_warn(
            'Issue import create validation failed',
            row_number: row_number,
            issue_description: attrs[:issue_description],
            errors: issue.errors.full_messages
          )
        end
      elsif issue.changed?
        if issue.save
          updated += 1
        else
          skipped += 1
          log_sheet_warn(
            'Issue import update validation failed',
            row_number: row_number,
            issue_description: attrs[:issue_description],
            errors: issue.errors.full_messages
          )
        end
      else
        skipped += 1
      end
    rescue StandardError => e
      log_sheet_error(
        'Issue import row failed',
        exception: e,
        payload: {
          row_number: row_number,
          issue_description: attrs[:issue_description],
          row: summarize_sheet_row(row)
        }
      )
      raise
    end

    summary = { created: created, updated: updated, skipped: skipped, total: rows.length - 1 }
    log_sheet_info('Issue sheet import completed', summary: summary)
    summary
  rescue StandardError => e
    log_sheet_error('Issue sheet import failed', exception: e)
    raise
  end

  private

  def build_attrs(headers, row)
    attrs = {}
    headers.each_with_index do |header, idx|
      target = HEADER_MAP[header]
      next unless target

      value = row[idx].to_s.strip
      next if value.blank?

      attrs[target] = target == :found_on ? parse_date(value) : value
    end
    attrs
  end

  def find_existing_issue(attrs)
    Issue.where(project_id: @project.id)
         .where(issue_description: attrs[:issue_description], module_name: attrs[:module_name], sub_module: attrs[:sub_module])
         .where(found_on: attrs[:found_on])
         .first_or_initialize
  end

  def build_title(attrs)
    [
      attrs[:module_name],
      attrs[:sub_module],
      attrs[:issue_description]
    ].compact.join(" - ").truncate(120)
  end

  def parse_date(value)
    Date.parse(value)
  rescue ArgumentError
    nil
  end

  def normalize_header(value)
    value.to_s.downcase.gsub(/[^a-z0-9]/, "")
  end

  def sheet_logging_payload
    super.merge(project_id: @project.id)
  end
end
