require 'bigdecimal'
require 'date'
require 'google/apis/sheets_v4'
require 'googleauth'

class TaskSheetService
  include SheetOperationLogging

  SHEET_READ_RANGE = 'A1:ZZ'.freeze
  SHEET_CLEAR_RANGE = 'A:ZZ'.freeze

  COLUMN_DEFINITIONS = [
    { key: :order, header: 'Order', aliases: ['order'], managed: true },
    { key: :task_id, header: 'Task', aliases: ['task id', 'ticket', 'issue key'], managed: true },
    { key: :title, header: 'Task details', aliases: ['task title', 'title', 'summary'], managed: true },
    { key: :estimated_hours, header: 'Est. Hours', aliases: ['estimated hours', 'est hours'], managed: true },
    { key: :developer, header: 'Dev Assigned', aliases: ['assigned to developer', 'developer'], managed: true },
    { key: :review, header: 'Review', aliases: ['assigned user', 'assigned to user'], managed: true },
    { key: :qa_assigned, header: 'QA Assigned', aliases: ['qa owner'], managed: true },
    { key: :internal_qa, header: 'Internal QA', aliases: ['internal qa owner'], managed: true },
    { key: :blocker, header: 'Blocker?', aliases: ['blocker'], managed: true },
    { key: :demo, header: 'Demo', aliases: ['demo required'], managed: true },
    { key: :swag_point, header: 'Swag point', aliases: ['swag points'], managed: true },
    { key: :story_point, header: 'Story point', aliases: ['story points'], managed: true },
    { key: :dev_hours, header: 'Dev', aliases: ['development'], managed: true },
    { key: :code_review_hours, header: 'Code Review', aliases: ['review hours'], managed: true },
    { key: :dev_to_qa_hours, header: 'Dev2QA', aliases: ['dev to qa', 'dev qa'], managed: true },
    { key: :qa_hours, header: 'QA', aliases: ['qa hours'], managed: true },
    { key: :automation_qa_hours, header: 'Automation QA', aliases: ['automationqa'], managed: true },
    { key: :total_hours, header: 'Total', aliases: ['total hours'], managed: true },
    { key: :priority, header: 'Priority', aliases: ['priority level'], managed: true },
    { key: :start_date, header: 'Start Date', aliases: ['start'], managed: true },
    { key: :end_date, header: 'End Date', aliases: ['end', 'due date'], managed: true },
    { key: :status, header: 'Status', aliases: ['task status'], managed: true },
    { key: :dev_sprint_days, header: 'Dev Sprint Days', aliases: ['developer sprint days'], managed: false },
    { key: :dev_official, header: 'Dev Offcial', aliases: ['dev official'], managed: false },
    { key: :legacy_dev_hours, header: 'Dev Hours', aliases: ['developer hours'], managed: false },
    { key: :internal_qa_assigned, header: 'Internal QA Assigned', aliases: ['internal qa assignee'], managed: false },
    { key: :approved_hours, header: 'Approved Hours', aliases: ['approved'], managed: false },
    { key: :actual_hours, header: 'Actual Hours', aliases: ['actual'], managed: false },
    { key: :shubham, header: 'Shubham', aliases: [], managed: false },
    { key: :story_estimation_difference, header: 'Story Estimation Difference', aliases: ['estimation difference'], managed: false }
  ].freeze

  DEFAULT_EXPORT_KEYS = %i[
    task_id
    title
    developer
    review
    qa_assigned
    internal_qa
    blocker
    demo
    swag_point
    story_point
    dev_hours
    code_review_hours
    dev_to_qa_hours
    qa_hours
    automation_qa_hours
    total_hours
    priority
    dev_sprint_days
    dev_official
    legacy_dev_hours
    internal_qa_assigned
    approved_hours
    actual_hours
    shubham
    story_estimation_difference
  ].freeze

  def initialize(sheet_name, spreadsheet_id, workspace: Current.workspace)
    @workspace = workspace
    @sheet_name = sheet_name
    @spreadsheet_id = spreadsheet_id
    @service = Google::Apis::SheetsV4::SheetsService.new
    @service.client_options.application_name = 'Rails Task Sheet'
    @service.authorization = authorize
  end

  def import_tasks(sprint_id:, created_by_id:, project_id: nil)
    log_sheet_info('Task sheet import started', sprint_id: sprint_id, project_id: project_id, created_by_id: created_by_id)

    data = read_sheet
    snapshot = build_sheet_snapshot(data)
    imported_count = import_tasks_from_sheet(
      snapshot,
      sprint_id: sprint_id,
      created_by_id: created_by_id,
      project_id: project_id
    )

    log_sheet_info(
      'Task sheet import completed',
      sprint_id: sprint_id,
      project_id: project_id,
      created_by_id: created_by_id,
      imported_count: imported_count,
      source_row_count: data.size
    )
    imported_count
  rescue StandardError => e
    log_sheet_error(
      'Task sheet import failed',
      exception: e,
      payload: { sprint_id: sprint_id, project_id: project_id, created_by_id: created_by_id }
    )
    raise
  end

  def export_tasks(tasks, title: nil)
    log_sheet_info('Task sheet export started', task_count: tasks.size)

    existing_data = read_sheet
    snapshot = build_sheet_snapshot(existing_data, allow_missing_header: true)

    write_tasks_to_sheet(tasks, snapshot: snapshot, title: title)

    log_sheet_info('Task sheet export completed', task_count: tasks.size)
  rescue StandardError => e
    log_sheet_error('Task sheet export failed', exception: e, payload: { task_count: tasks.size })
    raise
  end

  private

  def authorize
    Integrations::GoogleAuthorization.call(workspace: @workspace)
  end

  def read_sheet
    range = "#{@sheet_name}!#{SHEET_READ_RANGE}"
    ensure_spreadsheet_id!
    log_sheet_info('Task sheet read started', range: range)
    response = @service.get_spreadsheet_values(@spreadsheet_id, range)
    rows = response.values || []
    log_sheet_info('Task sheet read completed', range: range, row_count: rows.size)
    rows
  rescue StandardError => e
    log_sheet_error('Task sheet read failed', exception: e, payload: { range: range })
    raise
  end

  def build_sheet_snapshot(sheet_data, allow_missing_header: false)
    header_row_index = detect_header_row_index(sheet_data)

    if header_row_index.nil?
      raise StandardError, "Unable to detect task sheet headers in #{@sheet_name}" unless allow_missing_header

      columns = default_column_plan
      return {
        rows: sheet_data,
        header_row_index: nil,
        columns: columns,
        available_keys: [],
        existing_rows: {},
        title: nil
      }
    end

    header_row = sheet_data[header_row_index] || []
    columns = build_column_plan(header_row)

    {
      rows: sheet_data,
      header_row_index: header_row_index,
      columns: columns,
      available_keys: columns.filter_map { |column| column[:key] if column[:index] },
      existing_rows: build_existing_row_lookup(sheet_data, header_row_index, columns),
      title: extract_existing_title(sheet_data, header_row_index)
    }
  end

  def detect_header_row_index(rows)
    best_match = nil

    rows.each_with_index do |row, index|
      normalized_cells = Array(row).map { |cell| normalize_header(cell) }.reject(&:blank?)
      next if normalized_cells.empty?

      matched_keys = normalized_cells.filter_map { |cell| column_definition_for_header(cell)&.fetch(:key) }.uniq
      next unless matched_keys.include?(:task_id) && matched_keys.include?(:title)

      score = matched_keys.size
      next if score < 3

      best_match = { index: index, score: score } if best_match.nil? || score > best_match[:score]
    end

    best_match&.fetch(:index)
  end

  def build_column_plan(header_row)
    columns = []
    seen_keys = {}

    Array(header_row).each_with_index do |cell, index|
      next if cell.blank?

      definition = column_definition_for_header(cell)

      if definition
        columns << build_plan_entry(definition, index: index, header: cell.to_s.strip)
        seen_keys[definition[:key]] = true
      else
        columns << {
          key: :"extra_#{index}",
          header: cell.to_s.strip,
          index: index,
          managed: false
        }
      end
    end

    DEFAULT_EXPORT_KEYS.each do |key|
      next if seen_keys[key]

      columns << build_plan_entry(column_definition(key))
    end

    columns
  end

  def default_column_plan
    DEFAULT_EXPORT_KEYS.map { |key| build_plan_entry(column_definition(key)) }
  end

  def build_plan_entry(definition, index: nil, header: nil)
    {
      key: definition[:key],
      header: header || definition[:header],
      index: index,
      managed: definition[:managed]
    }
  end

  def build_existing_row_lookup(rows, header_row_index, columns)
    data_rows = rows[(header_row_index + 1)..] || []

    data_rows.each_with_object({}) do |row, lookup|
      mapped_row = map_row_by_columns(row, columns)
      task_id = lookup_task_key(mapped_row[:task_id])
      next if task_id.blank?

      lookup[task_id] = mapped_row
    end
  end

  def extract_existing_title(rows, header_row_index)
    return nil unless header_row_index&.positive?

    title_rows = rows[0...header_row_index] || []
    title_rows.each do |row|
      first_value = Array(row).find(&:present?)
      return first_value.to_s.strip if first_value.present?
    end

    nil
  end

  def import_tasks_from_sheet(snapshot, sprint_id:, created_by_id:, project_id: nil)
    imported_count = 0
    sprint = Sprint.find_by(id: sprint_id) if sprint_id.present?

    data_rows = snapshot[:rows][(snapshot[:header_row_index] + 1)..] || []
    data_rows.each_with_index do |row, index|
      row_number = snapshot[:header_row_index] + index + 2
      row_values = map_row_by_columns(row, snapshot[:columns])

      next if row_values.values.all?(&:blank?)

      task_id = clean_text(row_values[:task_id])
      title = clean_text(row_values[:title])
      next if task_id.blank? && title.blank?

      if task_id.blank?
        log_sheet_warn('Task import row skipped: missing task id', row_number: row_number, row: summarize_sheet_row(row))
        next
      end

      task = Task.find_or_initialize_by(task_id: task_id)
      attributes = build_import_attributes(
        task: task,
        task_id: task_id,
        title: title,
        row_values: row_values,
        available_keys: snapshot[:available_keys],
        row_number: row_number,
        row_position: imported_count + 1,
        sprint: sprint,
        sprint_id: sprint_id,
        project_id: project_id,
        created_by_id: created_by_id
      )

      task.assign_attributes(attributes)
      task.save!
      imported_count += 1
    rescue StandardError => e
      log_sheet_error(
        'Task import row failed',
        exception: e,
        payload: {
          row_number: row_number,
          task_id: task_id,
          title: title,
          row: summarize_sheet_row(row)
        }
      )
      raise
    end

    imported_count
  end

  def build_import_attributes(task:, task_id:, title:, row_values:, available_keys:, row_number:, row_position:, sprint:, sprint_id:, project_id:, created_by_id:)
    task_type = infer_task_type(title, task, row_values: row_values)
    developer_name = clean_text(row_values[:developer])
    review_name = clean_text(row_values[:review])
    developer = find_user_by_name(developer_name)
    review_user = find_user_by_name(review_name)

    log_sheet_warn('Task import developer not found', row_number: row_number, developer_name: developer_name, task_id: task_id) if developer_name.present? && developer.nil?
    log_sheet_warn('Task import review user not found', row_number: row_number, user_name: review_name, task_id: task_id) if review_name.present? && review_user.nil?

    attributes = {
      task_url: build_task_url(task_id, current_url: task.task_url),
      type: task_type,
      sprint_id: sprint_id,
      project_id: project_id,
      order: parse_integer(row_values[:order]) || row_position,
      created_by: task.created_by || created_by_id,
      updated_by: created_by_id,
      description: task.description.presence || ''
    }

    attributes[:title] = title if available_keys.include?(:title) || title.present? || task.new_record?

    if available_keys.include?(:developer)
      attributes[:developer_id] =
        if developer.present?
          developer.id
        elsif task_type == 'qa'
          nil
        else
          task.developer_id
        end
    elsif task.new_record? && task_type != 'qa' && developer.present?
      attributes[:developer_id] = developer.id
    end

    if available_keys.include?(:review)
      attributes[:assigned_to_user] = review_user&.id
    elsif task.new_record? && review_user.present?
      attributes[:assigned_to_user] = review_user.id
    end

    assign_text_attribute(attributes, :qa_assigned, row_values[:qa_assigned], available_keys)
    assign_text_attribute(attributes, :internal_qa, row_values[:internal_qa], available_keys)
    assign_text_attribute(attributes, :priority, row_values[:priority], available_keys)

    if !available_keys.include?(:internal_qa) && available_keys.include?(:internal_qa_assigned)
      attributes[:internal_qa] = clean_text(row_values[:internal_qa_assigned]).presence
    end

    assign_decimal_attribute(attributes, :swag_point, row_values[:swag_point], available_keys)
    assign_decimal_attribute(attributes, :story_point, row_values[:story_point], available_keys)
    assign_decimal_attribute(attributes, :dev_hours, row_values[:dev_hours], available_keys)
    assign_decimal_attribute(attributes, :code_review_hours, row_values[:code_review_hours], available_keys)
    assign_decimal_attribute(attributes, :dev_to_qa_hours, row_values[:dev_to_qa_hours], available_keys)
    assign_decimal_attribute(attributes, :qa_hours, row_values[:qa_hours], available_keys)
    assign_decimal_attribute(attributes, :automation_qa_hours, row_values[:automation_qa_hours], available_keys)
    assign_decimal_attribute(attributes, :total_hours, row_values[:total_hours], available_keys)

    if !available_keys.include?(:estimated_hours) && available_keys.include?(:approved_hours)
      attributes[:estimated_hours] = parse_decimal(row_values[:approved_hours])
    end

    if !available_keys.include?(:dev_hours) && available_keys.include?(:legacy_dev_hours)
      attributes[:dev_hours] = parse_decimal(row_values[:legacy_dev_hours])
    end

    if !available_keys.include?(:total_hours) && available_keys.include?(:actual_hours)
      attributes[:total_hours] = parse_decimal(row_values[:actual_hours])
    end

    estimated_hours = estimated_hours_for_task_type(task_type, row_values)
    attributes[:estimated_hours] = estimated_hours if estimated_hours.present?

    attributes[:blocker] = parse_boolean(row_values[:blocker]) if available_keys.include?(:blocker)
    attributes[:demo] = parse_boolean(row_values[:demo]) if available_keys.include?(:demo)

    if available_keys.include?(:status)
      attributes[:status] = map_status(row_values[:status]) || task.status.presence || 'todo'
    elsif task.new_record?
      attributes[:status] = task.status.presence || 'todo'
    end

    if available_keys.include?(:start_date)
      attributes[:start_date] = parse_date(row_values[:start_date])
    elsif task.start_date.blank? && sprint&.start_date.present?
      attributes[:start_date] = sprint.start_date
    end

    if available_keys.include?(:end_date)
      attributes[:end_date] = parse_date(row_values[:end_date])
    elsif task.end_date.blank? && sprint&.end_date.present?
      attributes[:end_date] = sprint.end_date
    end

    attributes
  end

  def assign_text_attribute(attributes, key, value, available_keys)
    return unless available_keys.include?(key)

    attributes[key] = clean_text(value).presence
  end

  def assign_decimal_attribute(attributes, key, value, available_keys)
    return unless available_keys.include?(key)

    attributes[key] = parse_decimal(value)
  end

  def write_tasks_to_sheet(tasks, snapshot:, title:)
    clear_sheet

    columns = snapshot[:columns]
    column_count = [columns.size, 1].max
    title_value = title.presence || snapshot[:title].presence || @sheet_name

    values = []
    values << [title_value] + Array.new(column_count - 1, '') if title_value.present?
    values << columns.map { |column| column[:header] }

    tasks.each_with_index do |task, index|
      existing_row = snapshot[:existing_rows][lookup_task_key(task.task_id)]
      values << columns.map { |column| export_cell_for(task, column, index: index, existing_row: existing_row) }
    end

    value_range = Google::Apis::SheetsV4::ValueRange.new(values: values)

    @service.update_spreadsheet_value(
      @spreadsheet_id,
      "#{@sheet_name}!A1",
      value_range,
      value_input_option: 'USER_ENTERED'
    )

    title_rows_count = title_value.present? ? 1 : 0
    data_start_row_index = title_rows_count + 1

    highlight_completed_rows(tasks, start_row_index: data_start_row_index, column_count: column_count)
    highlight_in_progress_rows(tasks, start_row_index: data_start_row_index, column_count: column_count)
  end

  def export_cell_for(task, column, index:, existing_row:)
    existing_value = existing_row&.dig(column[:key])

    case column[:key]
    when :order
      index + 1
    when :task_id
      task_id_cell(task)
    when :title
      task.title.to_s
    when :estimated_hours
      format_number(display_estimated_hours(task))
    when :developer
      task.developer&.name.to_s
    when :review
      task.assigned_user&.name.to_s
    when :qa_assigned
      task.qa_assigned.to_s
    when :internal_qa
      task.internal_qa.to_s
    when :blocker
      task.blocker? ? 'Yes' : ''
    when :demo
      task.demo? ? 'Yes' : ''
    when :swag_point
      format_number(task.swag_point)
    when :story_point
      format_number(task.story_point)
    when :dev_hours
      format_number(task.dev_hours)
    when :code_review_hours
      format_number(task.code_review_hours)
    when :dev_to_qa_hours
      format_number(task.dev_to_qa_hours)
    when :qa_hours
      format_number(task.qa_hours)
    when :automation_qa_hours
      format_number(task.automation_qa_hours)
    when :total_hours
      format_number(task.total_hours)
    when :priority
      task.priority.to_s
    when :start_date
      format_date(task.start_date)
    when :end_date
      format_date(task.end_date)
    when :status
      humanize_status(task.status)
    when :dev_sprint_days
      existing_value.presence || sprint_days_value(task)
    when :legacy_dev_hours
      existing_value.presence || format_number(task.dev_hours)
    when :internal_qa_assigned
      existing_value.presence || task.internal_qa.to_s
    when :approved_hours
      existing_value.presence || format_number(task.estimated_hours)
    when :actual_hours
      existing_value.presence || format_number(task.total_hours)
    else
      existing_value.to_s
    end
  end

  def task_id_cell(task)
    return '' if task.task_id.blank?

    url = build_task_url(task.task_id, current_url: task.task_url)
    %Q{=HYPERLINK("#{url}","#{task.task_id}")}
  end

  def build_task_url(task_id, current_url: nil)
    return '' if task_id.blank?

    current_url.presence || "https://resmedsaas.atlassian.net/browse/#{task_id}"
  end

  def format_date(value)
    return '' unless value

    value.strftime('%m/%d/%Y')
  end

  def humanize_status(value)
    case map_status(value)
    when 'completed'
      'Completed'
    when 'inprogress'
      'In Progress'
    when 'todo'
      'To Do'
    else
      clean_text(value).to_s
    end
  end

  def sprint_days_value(task)
    return '' unless task.start_date && task.end_date

    ((task.end_date - task.start_date).to_i + 1).clamp(0, 366)
  end

  def parse_date(value)
    return nil if value.blank?

    raw = value.to_s.strip

    ['%m/%d/%Y', '%Y-%m-%d'].each do |format|
      begin
        return Date.strptime(raw, format)
      rescue StandardError
        next
      end
    end

    nil
  end

  def parse_decimal(value)
    return nil if value.blank?

    normalized = value.to_s.gsub(/[^\d.\-]/, '')
    return nil if normalized.blank? || %w[- . -.].include?(normalized)

    BigDecimal(normalized)
  rescue ArgumentError
    nil
  end

  def parse_integer(value)
    decimal = parse_decimal(value)
    decimal&.to_i
  end

  def parse_boolean(value)
    normalized = normalize_header(value)
    return false if normalized.blank?
    return true if %w[1 true yes y x checked].include?(normalized)
    return false if %w[0 false no n].include?(normalized)

    true
  end

  def map_status(value)
    normalized = clean_text(value).to_s.downcase
    return nil if normalized.blank?
    return 'completed' if normalized.include?('completed') || normalized == 'done'
    return 'inprogress' if normalized.include?('in progress') || normalized.include?('inprogress')
    return 'todo' if normalized.include?('to do') || normalized.include?('todo')

    normalized.tr(' ', '_')
  end

  def infer_task_type(_title, task, row_values:)
    developer_assigned = clean_text(row_values[:developer]).present?
    qa_assigned = clean_text(row_values[:qa_assigned]).present?

    return 'Code' if developer_assigned
    return 'qa' if qa_assigned

    task.type.presence || 'Code'
  end

  def estimated_hours_for_task_type(task_type, row_values)
    preferred_hours =
      if task_type == 'qa'
        parse_decimal(row_values[:qa_hours])
      else
        parse_decimal(row_values[:dev_hours])
      end

    preferred_hours.presence || parse_decimal(row_values[:estimated_hours])
  end

  def display_estimated_hours(task)
    preferred_hours =
      if task.type.to_s == 'qa'
        task.qa_hours
      else
        task.dev_hours
      end

    preferred_hours.presence || task.estimated_hours
  end

  def map_row_by_columns(row, columns)
    columns.each_with_object({}) do |column, values|
      next unless column[:index]
      next if values.key?(column[:key])

      values[column[:key]] = row[column[:index]]
    end
  end

  def column_definition(key)
    column_definitions_by_key.fetch(key)
  end

  def column_definition_for_header(value)
    header_lookup[normalize_header(value)]
  end

  def column_definitions_by_key
    @column_definitions_by_key ||= COLUMN_DEFINITIONS.index_by { |definition| definition[:key] }
  end

  def header_lookup
    @header_lookup ||= COLUMN_DEFINITIONS.each_with_object({}) do |definition, lookup|
      ([definition[:header]] + definition[:aliases]).each do |candidate|
        lookup[normalize_header(candidate)] ||= definition
      end
    end
  end

  def normalize_header(value)
    value.to_s.downcase.gsub(/[^a-z0-9]/, '')
  end

  def clean_text(value)
    value.to_s.strip
  end

  def lookup_task_key(value)
    clean_text(value).downcase
  end

  def clear_sheet
    ensure_spreadsheet_id!
    @service.clear_values(@spreadsheet_id, "#{@sheet_name}!#{SHEET_CLEAR_RANGE}")
  end

  def find_user_by_name(value)
    normalized = value.to_s.strip.downcase
    return if normalized.blank?

    user_lookup[normalized]
  end

  def user_lookup
    @user_lookup ||= Current.workspace.users.order(:id).each_with_object({}) do |user, lookup|
      [user.first_name, user.last_name, user.full_name, user.name, user.email].compact.each do |entry|
        normalized = entry.to_s.strip.downcase
        next if normalized.blank?

        lookup[normalized] ||= user
      end
    end
  end

  def highlight_completed_rows(tasks, start_row_index:, column_count:)
    requests = []

    tasks.each_with_index do |task, index|
      next unless task.status.to_s.downcase == 'completed'

      requests << Google::Apis::SheetsV4::Request.new(
        repeat_cell: Google::Apis::SheetsV4::RepeatCellRequest.new(
          range: Google::Apis::SheetsV4::GridRange.new(
            sheet_id: sheet_id,
            start_row_index: start_row_index + index,
            end_row_index: start_row_index + index + 1,
            start_column_index: 0,
            end_column_index: column_count
          ),
          cell: Google::Apis::SheetsV4::CellData.new(
            user_entered_format: Google::Apis::SheetsV4::CellFormat.new(
              background_color: Google::Apis::SheetsV4::Color.new(
                red: 0.85,
                green: 0.94,
                blue: 0.72
              )
            )
          ),
          fields: 'userEnteredFormat.backgroundColor'
        )
      )
    end

    return if requests.empty?

    batch_request = Google::Apis::SheetsV4::BatchUpdateSpreadsheetRequest.new(requests: requests)
    @service.batch_update_spreadsheet(@spreadsheet_id, batch_request)
  end

  def highlight_in_progress_rows(tasks, start_row_index:, column_count:)
    requests = []

    tasks.each_with_index do |task, index|
      status = task.status.to_s.downcase
      next unless status == 'in progress' || status == 'inprogress'

      requests << Google::Apis::SheetsV4::Request.new(
        repeat_cell: Google::Apis::SheetsV4::RepeatCellRequest.new(
          range: Google::Apis::SheetsV4::GridRange.new(
            sheet_id: sheet_id,
            start_row_index: start_row_index + index,
            end_row_index: start_row_index + index + 1,
            start_column_index: 0,
            end_column_index: column_count
          ),
          cell: Google::Apis::SheetsV4::CellData.new(
            user_entered_format: Google::Apis::SheetsV4::CellFormat.new(
              background_color: Google::Apis::SheetsV4::Color.new(
                red: 1.0,
                green: 1.0,
                blue: 0.6
              )
            )
          ),
          fields: 'userEnteredFormat.backgroundColor'
        )
      )
    end

    return if requests.empty?

    batch_request = Google::Apis::SheetsV4::BatchUpdateSpreadsheetRequest.new(requests: requests)
    @service.batch_update_spreadsheet(@spreadsheet_id, batch_request)
  end

  def format_number(value)
    return '' if value.nil?

    decimal = value.is_a?(BigDecimal) ? value : BigDecimal(value.to_s)
    decimal.to_s('F').sub(/\.0+\z/, '').sub(/(\.\d*?)0+\z/, '\1')
  rescue StandardError
    value.to_s
  end

  def sheet_id
    @sheet_id ||= begin
      ensure_spreadsheet_id!
      spreadsheet = @service.get_spreadsheet(@spreadsheet_id)
      sheet = spreadsheet.sheets.find { |entry| entry.properties.title == @sheet_name }
      return sheet.properties.sheet_id if sheet

      raise StandardError, "Sheet not found: #{@sheet_name}"
    end
  end

  def ensure_spreadsheet_id!
    raise ArgumentError, 'Spreadsheet ID is missing' if @spreadsheet_id.blank?
  end
end
