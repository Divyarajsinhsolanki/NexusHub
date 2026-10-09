class Api::DailyMomentumController < Api::BaseController
  ACTIVE_STATUSES = %w[todo inprogress in_progress doing blocked reviewing qa backlog].freeze
  COMPLETED_STATUSES = %w[done completed complete archived cancelled].freeze

  def show
    today = Time.zone.today
    yesterday = today - 1.day

    user_tasks = Task.visible_to(current_user)
      .where(assigned_to_user: current_user.id)
      .or(Task.visible_to(current_user).where(created_by: current_user.id))
      .includes(:project, :sprint)

    overdue_tasks = user_tasks
      .where.not(end_date: nil)
      .where('end_date < ?', today)
      .where.not(status: COMPLETED_STATUSES)
      .order(end_date: :asc)
      .limit(6)

    focus_tasks = user_tasks
      .where('(start_date IS NULL OR start_date <= ?)', today)
      .where('(end_date IS NULL OR end_date >= ?)', today)
      .where(status: ACTIVE_STATUSES)
      .order(Arel.sql("CASE WHEN status = 'blocked' THEN 0 WHEN status IN ('inprogress','in_progress','doing') THEN 1 ELSE 2 END"))
      .limit(6)

    triage_tasks = Task.visible_to(current_user)
      .includes(:project, :sprint)
      .where(created_by: current_user.id)
      .where('assigned_to_user IS NULL OR sprint_id IS NULL')
      .order(updated_at: :desc)
      .limit(6)

    meetings = todays_meetings(today)

    recent_logs = WorkLog
      .includes(:category)
      .where(user: current_user, log_date: (today - 30.days)..today)

    top_categories = build_top_categories(recent_logs)
    top_tags = build_top_tags(recent_logs)
    default_priority_id = recent_logs.where.not(priority_id: nil)
                                     .group(:priority_id)
                                     .order(Arel.sql('COUNT(*) DESC'))
                                     .limit(1)
                                     .pluck(:priority_id)
                                     .first

    last_log = WorkLog.where(user: current_user).order(log_date: :desc, end_time: :desc).first
    quick_log_template = {
      suggestion_date: today,
      default_start_time: (last_log&.log_date == today ? last_log.end_time : nil),
      default_category_id: top_categories.first&.dig(:id),
      default_priority_id: default_priority_id
    }.compact

    due_bookmarks = current_user.knowledge_bookmarks.due_for_reminder.order(:next_reminder_at)
    due_card = serialize_bookmark(due_bookmarks.first)

    yesterday_logs = WorkLog
      .includes(:category)
      .where(user: current_user, log_date: yesterday)

    render json: {
      generated_at: Time.current,
      date: today,
      morning_briefing: {
        overdue_tasks: serialize_tasks(overdue_tasks),
        focus_tasks: serialize_tasks(focus_tasks),
        needs_triage: serialize_tasks(triage_tasks),
        meetings: meetings.map { |log| serialize_work_log(log) }
      },
      rapid_logging: {
        top_categories: top_categories,
        top_tags: top_tags,
        quick_log_template: quick_log_template,
        suggestions: {
          recent_log_titles: recent_logs.order(updated_at: :desc).limit(3).pluck(:title)
        }
      },
      learning_nudge: {
        due_card: due_card,
        total_due: due_bookmarks.count
      },
      reflection: build_reflection(today, yesterday, yesterday_logs, user_tasks)
    }
  end

  private

  def todays_meetings(date)
    meeting_category_ids = WorkCategory.where('LOWER(name) LIKE ?', '%meeting%').pluck(:id)
    scope = WorkLog.includes(:category).where(user: current_user, log_date: date)
    scope = scope.where(category_id: meeting_category_ids) if meeting_category_ids.any?
    scope.order(:start_time)
  end

  def build_top_categories(recent_logs)
    counts = recent_logs
      .where.not(category_id: nil)
      .group(:category_id)
      .order(Arel.sql('COUNT(*) DESC'))
      .limit(3)
      .count

    categories = WorkCategory.where(id: counts.keys).index_by(&:id)

    counts.map do |category_id, count|
      category = categories[category_id]
      {
        id: category_id,
        name: category&.name || 'Uncategorized',
        color: category&.color,
        hex: category&.hex,
        count: count
      }
    end
  end

  def build_top_tags(recent_logs)
    return [] unless recent_logs.exists?

    counts = WorkLogTag
      .joins(:work_tag)
      .where(work_log_id: recent_logs.select(:id))
      .group(:work_tag_id, 'work_tags.name')
      .order(Arel.sql('COUNT(*) DESC'))
      .limit(6)
      .count

    counts.map do |(tag_id, tag_name), count|
      {
        id: tag_id,
        name: tag_name,
        count: count
      }
    end
  end

  def serialize_tasks(tasks)
    tasks.map do |task|
      {
        id: task.id,
        title: task.title.presence || task.task_id,
        status: task.status,
        start_date: task.start_date,
        end_date: task.end_date,
        sprint_id: task.sprint_id,
        project_id: task.project_id,
        project_name: task.project&.name,
        sprint_name: task.sprint&.name,
        assigned_to_user: task.assigned_to_user
      }
    end
  end

  def serialize_work_log(log)
    {
      id: log.id,
      title: log.title,
      log_date: log.log_date,
      start_time: log.start_time,
      end_time: log.end_time,
      category: log.category&.name
    }
  end

  def serialize_bookmark(bookmark)
    return unless bookmark

    payload = bookmark.payload || {}

    {
      id: bookmark.id,
      card_type: bookmark.card_type,
      collection_name: bookmark.collection_name,
      title: payload['title'] || payload['question'] || payload['term'] || payload['headline'],
      prompt: payload['prompt'] || payload['question'],
      answer: payload['answer'] || payload['summary'] || payload['definition'],
      next_reminder_at: bookmark.next_reminder_at,
      reminder_interval_days: bookmark.reminder_interval_days
    }
  end

  def build_reflection(today, yesterday, yesterday_logs, user_tasks)
    total_minutes = yesterday_logs.sum do |log|
      if log.actual_minutes.present? && log.actual_minutes.positive?
        log.actual_minutes
      else
        log.planned_minutes
      end
    end

    open_logs = WorkLog
      .where(user: current_user, log_date: today)
      .where(actual_minutes: [0, nil])
      .limit(5)

    blockers = user_tasks.where(status: 'blocked').limit(5)
    yesterday_note = current_user.work_notes.find_by(note_date: yesterday)

    {
      yesterday: {
        logs_count: yesterday_logs.size,
        total_minutes: total_minutes,
        note: yesterday_note&.content
      },
      blockers: serialize_tasks(blockers),
      unfinished_logs: open_logs.map { |log| serialize_work_log(log) }
    }
  end
end
