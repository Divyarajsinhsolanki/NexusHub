class Api::CalendarEventsController < Api::BaseController
  require 'cgi'

  before_action :set_calendar_event, only: [:update, :destroy, :reschedule, :google_link]
  before_action :authorize_event_edit!, only: [:update, :destroy, :reschedule]
  before_action :reject_managed_operation, only: [:update, :destroy, :reschedule]

  def index
    events = scoped_events.includes(:event_reminders).order(:start_at)

    if params[:start].present? && params[:end].present?
      begin
        start_time = Time.zone.parse(params[:start])
        end_time = Time.zone.parse(params[:end])
        events = events.within_range(start_time, end_time) if start_time.present? && end_time.present?
      rescue ArgumentError
        return render json: { error: 'Invalid start or end datetime filter' }, status: :unprocessable_entity
      end
    end

    events = events.where(project_id: params[:project_id]) if params[:project_id].present?
    events = events.where(visibility: params[:visibility]) if params[:visibility].present?

    payload = events.map { |event| event_payload(event) }

    if ActiveModel::Type::Boolean.new.cast(params[:include_insights])
      render json: {
        data: payload,
        insights: workload_insights(events)
      }
    else
      render json: payload
    end
  end

  def create
    recurrence = recurrence_options
    created_events = []

    CalendarEvent.transaction do
      root_event = current_user.calendar_events.create!(calendar_event_params)
      created_events << root_event

      build_recurrences(root_event, recurrence).each do |attrs|
        created_events << current_user.calendar_events.create!(attrs.merge(recurrence_parent_id: root_event.id))
      end
    end

    render json: {
      events: created_events.map { |event| event_payload(event) },
      conflicts: created_events.index_with { |event| conflict_messages(event) }
    }, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: [e.record.errors.full_messages].flatten }, status: :unprocessable_entity
  end

  def update
    if @calendar_event.update(calendar_event_params)
      render json: event_payload(@calendar_event).merge(conflicts: conflict_messages(@calendar_event))
    else
      render json: { errors: @calendar_event.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def reschedule
    start_at = Time.zone.parse(params[:start_at].to_s)
    end_at = Time.zone.parse(params[:end_at].to_s)

    return render json: { error: 'Invalid datetime values' }, status: :unprocessable_entity unless start_at && end_at

    if @calendar_event.update(start_at: start_at, end_at: end_at)
      render json: event_payload(@calendar_event).merge(conflicts: conflict_messages(@calendar_event))
    else
      render json: { errors: @calendar_event.errors.full_messages }, status: :unprocessable_entity
    end
  rescue ArgumentError
    render json: { error: 'Invalid datetime values' }, status: :unprocessable_entity
  end

  def destroy
    if ActiveModel::Type::Boolean.new.cast(params[:delete_series]) && @calendar_event.recurrence_parent_id.nil?
      CalendarEvent.where(id: [@calendar_event.id] + @calendar_event.recurrence_instances.pluck(:id)).destroy_all
      head :no_content
    else
      @calendar_event.destroy
      head :no_content
    end
  end

  def export_ics
    events = scoped_events.order(:start_at)
    render plain: build_ics(events), content_type: 'text/calendar'
  end

  def import_ics
    raw_ics = params[:ics].to_s
    parsed_events = parse_ics(raw_ics)

    return render json: { errors: ['No events found in ICS payload'] }, status: :unprocessable_entity if parsed_events.empty?

    created = CalendarEvent.transaction do
      parsed_events.map { |attrs| current_user.calendar_events.create!(attrs) }
    end

    render json: { imported_count: created.count, events: created.map { |event| event_payload(event) } }, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: [e.record.errors.full_messages].flatten }, status: :unprocessable_entity
  end

  def google_link
    render json: { google_url: @calendar_event.google_event_url }
  end

  private

  def reject_managed_operation
    return unless @calendar_event.managed_operation?

    render json: { error: 'Manage this deadline in Project Environments.', operation_path: @calendar_event.operation_path }, status: :unprocessable_entity
  end

  def set_calendar_event
    @calendar_event = scoped_events.find(params[:id])
  end

  def scoped_events
    CalendarEvent.accessible_to(current_user)
  end

  def authorize_event_edit!
    head :forbidden unless @calendar_event.editable_by?(current_user)
  end

  def calendar_event_params
    params.require(:calendar_event).permit(
      :title,
      :description,
      :start_at,
      :end_at,
      :all_day,
      :event_type,
      :visibility,
      :status,
      :project_id,
      :task_id,
      :sprint_id,
      :location_or_meet_link,
      :recurrence_rule,
      :recurrence_until,
      :external_source,
      :external_id
    )
  end

  def recurrence_options
    params.fetch(:calendar_event, {}).slice(:recurrence_count)
  end

  def build_recurrences(root_event, recurrence)
    return [] if root_event.recurrence_rule.blank? || root_event.recurrence_rule == 'none'

    recurrence_count = recurrence[:recurrence_count].to_i
    recurrence_count = 0 if recurrence_count.negative?
    recurrence_count = 30 if recurrence_count > 30

    events = []
    current_start = root_event.start_at
    current_end = root_event.end_at

    recurrence_count.times do
      current_start, current_end = next_recurrence_window(root_event.recurrence_rule, current_start, current_end)
      break if root_event.recurrence_until.present? && current_start > root_event.recurrence_until

      events << root_event.attributes.slice(
        'title', 'description', 'all_day', 'event_type', 'visibility', 'status', 'project_id', 'task_id', 'sprint_id', 'location_or_meet_link', 'recurrence_rule', 'recurrence_until', 'external_source', 'external_id'
      ).merge(
        start_at: current_start,
        end_at: current_end
      )
    end

    events
  end

  def next_recurrence_window(rule, start_at, end_at)
    case rule
    when 'daily'
      [start_at + 1.day, end_at + 1.day]
    when 'weekly'
      [start_at + 1.week, end_at + 1.week]
    when 'monthly'
      [start_at + 1.month, end_at + 1.month]
    else
      [start_at, end_at]
    end
  end

  def conflict_messages(event)
    conflict_scope = scoped_events.where(user_id: event.user_id)
                                  .where.not(id: event.id)
                                  .within_range(event.start_at, event.end_at)

    conflict_scope.limit(5).pluck(:id, :title, :start_at, :end_at).map do |id, title, start_at, end_at|
      {
        event_id: id,
        title: title,
        start_at: start_at,
        end_at: end_at
      }
    end
  end

  def workload_insights(events)
    grouped = events.group_by { |event| event.start_at.to_date }

    per_day = grouped.transform_values do |day_events|
      {
        total_events: day_events.size,
        meetings: day_events.count { |event| event.event_type == 'meeting' },
        focus_blocks: day_events.count { |event| event.event_type == 'focus' },
        overloaded: day_events.size >= 6
      }
    end

    {
      total_events: events.size,
      overloaded_days: per_day.count { |_date, data| data[:overloaded] },
      by_date: per_day
    }
  end

  def event_payload(event)
    event.as_api_json.merge(
      can_edit: !event.managed_operation? && event.editable_by?(current_user),
      conflicts_count: conflict_messages(event).size,
      google_event_url: event.google_event_url
    )
  end

  def build_ics(events)
    lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//RailsVite//Calendar//EN',
      'CALSCALE:GREGORIAN'
    ]

    events.each do |event|
      lines.concat([
        'BEGIN:VEVENT',
        "UID:calendar-event-#{event.id}@rails-vite",
        "DTSTAMP:#{event.updated_at.utc.strftime('%Y%m%dT%H%M%SZ')}",
        "DTSTART:#{event.start_at.utc.strftime('%Y%m%dT%H%M%SZ')}",
        "DTEND:#{event.end_at.utc.strftime('%Y%m%dT%H%M%SZ')}",
        "SUMMARY:#{ics_escape(event.title)}",
        "DESCRIPTION:#{ics_escape(event.description.to_s)}",
        "LOCATION:#{ics_escape(event.location_or_meet_link.to_s)}",
        'END:VEVENT'
      ])
    end

    lines << 'END:VCALENDAR'
    lines.join("\r\n")
  end

  def ics_escape(text)
    text.to_s.gsub('\\', '\\\\').gsub(';', '\\;').gsub(',', '\\,').gsub("\n", '\\n')
  end

  def parse_ics(raw_ics)
    blocks = raw_ics.split('BEGIN:VEVENT').drop(1)

    blocks.filter_map do |block|
      body = block.split('END:VEVENT').first.to_s
      title = body[/^SUMMARY:(.+)$/i, 1]&.strip
      dtstart = body[/^DTSTART(?:;[^:]+)?:([^\n\r]+)$/i, 1]&.strip
      dtend = body[/^DTEND(?:;[^:]+)?:([^\n\r]+)$/i, 1]&.strip
      description = body[/^DESCRIPTION:(.+)$/i, 1]&.strip
      location = body[/^LOCATION:(.+)$/i, 1]&.strip

      next if title.blank? || dtstart.blank? || dtend.blank?

      start_at = Time.zone.parse(dtstart)
      end_at = Time.zone.parse(dtend)
      next if start_at.blank? || end_at.blank?

      {
        title: title,
        description: description,
        start_at: start_at,
        end_at: end_at,
        event_type: 'meeting',
        visibility: 'personal',
        status: 'scheduled',
        location_or_meet_link: location,
        external_source: 'ics'
      }
    end
  end
end
