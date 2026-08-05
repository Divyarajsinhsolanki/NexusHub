require "digest"
require "open3"

module Mcp
  class ToolExecutor
    class ToolError < StandardError; end

    DEFAULT_SEARCH_TYPES = %w[projects tasks issues users posts knowledge].freeze

    def initialize(user:, token:)
      @user = user
      @token = token
      Current.user = user
      Current.workspace = user.workspace
    end

    def call(name, arguments = {})
      args = arguments.to_h.with_indifferent_access

      case name
      when "app_snapshot" then app_snapshot
      when "daily_workspace_briefing" then daily_workspace_briefing(args)
      when "api_catalog" then api_catalog(args)
      when "mcp_capability_matrix" then mcp_capability_matrix(args)
      when "workspace_autopilot_plan" then workspace_autopilot_plan(args)
      when "render_workspace_autopilot" then render_workspace_autopilot(args)
      when "workspace_autopilot_apply" then workspace_autopilot_apply(args)
      when "search_everything" then search_everything(args)
      when "list_posts" then list_posts(args)
      when "create_post" then create_post(args)
      when "create_comment" then create_comment(args)
      when "like_post" then like_post(args)
      when "list_people" then list_people(args)
      when "list_departments" then list_departments(args)
      when "list_projects" then list_projects(args)
      when "get_project" then get_project(args)
      when "create_project" then create_project(args)
      when "update_project" then update_project(args)
      when "list_project_members" then list_project_members(args)
      when "add_project_member" then add_project_member(args)
      when "update_project_member" then update_project_member(args)
      when "list_project_environments" then list_project_environments(args)
      when "create_project_environment" then create_project_environment(args)
      when "list_project_vault_items" then list_project_vault_items(args)
      when "list_sprints" then list_sprints(args)
      when "create_sprint" then create_sprint(args)
      when "update_sprint" then update_sprint(args)
      when "export_sprint_tasks" then export_sprint_tasks(args)
      when "list_tasks" then list_tasks(args)
      when "create_task" then create_task(args)
      when "update_task" then update_task(args)
      when "list_task_logs" then list_task_logs(args)
      when "create_task_log" then create_task_log(args)
      when "list_issues" then list_issues(args)
      when "create_issue" then create_issue(args)
      when "update_issue" then update_issue(args)
      when "list_calendar_events" then list_calendar_events(args)
      when "create_calendar_event" then create_calendar_event(args)
      when "update_calendar_event" then update_calendar_event(args)
      when "daily_momentum" then daily_momentum
      when "list_work_logs" then list_work_logs(args)
      when "create_work_log" then create_work_log(args)
      when "update_work_log" then update_work_log(args)
      when "list_work_taxonomy" then list_work_taxonomy(args)
      when "create_work_taxonomy_item" then create_work_taxonomy_item(args)
      when "update_work_taxonomy_item" then update_work_taxonomy_item(args)
      when "list_work_notes" then list_work_notes(args)
      when "create_work_note" then create_work_note(args)
      when "update_work_note" then update_work_note(args)
      when "list_teams" then list_teams(args)
      when "list_skills" then list_skills(args)
      when "list_learning_goals" then list_learning_goals(args)
      when "portfolio_snapshot" then portfolio_snapshot
      when "list_knowledge_bookmarks" then list_knowledge_bookmarks(args)
      when "create_knowledge_bookmark" then create_knowledge_bookmark(args)
      when "list_knowledge_items" then list_knowledge_items(args)
      when "create_knowledge_items" then create_knowledge_items(args)
      when "list_conversations" then list_conversations(args)
      when "send_chat_message" then send_chat_message(args)
      when "list_notifications" then list_notifications(args)
      when "mark_notification_read" then mark_notification_read(args)
      when "list_pdf_documents" then list_pdf_documents(args)
      when "get_pdf_document_text" then get_pdf_document_text(args)
      when "list_pdf_operations" then list_pdf_operations(args)
      when "keka_profile_summary" then keka_profile_summary
      when "repo_status" then RepoTools.status
      when "repo_diff" then repo_diff(args)
      when "repo_search" then RepoTools.search(args)
      when "repo_read_file" then RepoTools.read_file(args)
      when "repo_write_file" then repo_write_file(args)
      when "repo_commit" then repo_commit(args)
      when "repo_patch_preview" then RepoTools.preview_patch(args)
      when "repo_apply_patch" then repo_apply_patch(args)
      when "run_tests" then run_tests(args)
      when "db_query" then db_query(args)
      when "rails_runner" then rails_runner(args)
      when "rails_console" then rails_console(args)
      else
        raise ToolError, "Unknown tool: #{name}"
      end
    end

    private

    attr_reader :user, :token

    def app_snapshot
      today = Time.zone.today
      {
        generated_at: Time.current,
        current_user: Serializer.user(user),
        workspace: workspace_payload,
        counts: {
          users: user.workspace.users.count,
          projects: Project.count,
          running_projects: Project.where(status: "running").count,
          sprints: Sprint.count,
          tasks: Task.count,
          open_tasks: Task.where.not(status: Serializer.completed_statuses).count,
          issues: Issue.count,
          open_issues: Issue.where.not(status: Serializer.closed_issue_statuses).count,
          teams: Team.count,
          skills: Skill.count,
          knowledge_bookmarks: user.knowledge_bookmarks.count,
          pdf_documents: user.pdf_documents.count
        },
        my_work: {
          assigned_open_tasks: Task.where(assigned_to_user: user.id).where.not(status: Serializer.completed_statuses).count,
          overdue_tasks: Task.where(assigned_to_user: user.id)
            .where.not(status: Serializer.completed_statuses)
            .where("end_date < ?", today)
            .count,
          upcoming_events_7_days: accessible_events(Time.current, 7.days.from_now).count,
          unread_notifications: user.notifications.unread.count,
          due_knowledge_reviews: user.knowledge_bookmarks.due_for_reminder.count
        },
        connector: {
          token_name: token.name,
          scopes: token.scopes,
          repo_write_enabled: RepoTools.write_enabled?
        }
      }
    end

    def daily_workspace_briefing(args)
      days_ahead = bounded_limit(args[:days_ahead], default: 7, max: 30)
      today = Time.zone.today
      future = days_ahead.days.from_now
      my_tasks = Task.includes(:project, :sprint)
        .where(assigned_to_user: user.id)
        .or(Task.where(created_by: user.id))

      overdue_tasks = my_tasks.where.not(status: Serializer.completed_statuses)
        .where("end_date < ?", today)
        .order(end_date: :asc)
        .limit(8)

      blocked_tasks = my_tasks.where(status: "blocked").order(updated_at: :desc).limit(8)
      upcoming_events = accessible_events(Time.current, future).order(:start_at).limit(12)
      severe_issues = Issue.includes(:project, :assignee_user)
        .where(severity: %w[High Critical])
        .where.not(status: Serializer.closed_issue_statuses)
        .order(Arel.sql("CASE severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 ELSE 2 END"), :due_date)
        .limit(10)
      due_bookmarks = user.knowledge_bookmarks.due_for_reminder.order(:next_reminder_at).limit(6)

      {
        generated_at: Time.current,
        window: {
          today: today,
          days_ahead: days_ahead
        },
        priorities: [
          priority_item("overdue_tasks", overdue_tasks.count, "Close or reschedule tasks past their end date."),
          priority_item("blocked_tasks", blocked_tasks.count, "Unblock work by adding owners, comments, or next actions."),
          priority_item("high_severity_issues", severe_issues.count, "Review high and critical QA issues before routine tasks."),
          priority_item("upcoming_events", upcoming_events.count, "Prepare for calendar commitments in the selected window."),
          priority_item("knowledge_reviews", due_bookmarks.count, "Review saved knowledge before reminders pile up.")
        ].select { |item| item[:count].positive? },
        overdue_tasks: overdue_tasks.map { |task| Serializer.task(task) },
        blocked_tasks: blocked_tasks.map { |task| Serializer.task(task) },
        high_severity_issues: severe_issues.map { |issue| Serializer.issue(issue) },
        upcoming_events: upcoming_events.map { |event| Serializer.calendar_event(event) },
        due_knowledge_reviews: due_bookmarks.map { |bookmark| Serializer.knowledge_bookmark(bookmark) },
        new_feature_ideas: innovation_ideas
      }
    end

    def api_catalog(args)
      prefix = args[:path_prefix].presence || "/api"
      limit = bounded_limit(args[:limit], default: 200, max: 500)
      routes = Rails.application.routes.routes.filter_map do |route|
        path = route.path.spec.to_s.gsub("(.:format)", "")
        next unless path.start_with?(prefix)
        next if route.defaults[:controller].blank?

        Serializer.route(route)
      end.first(limit)

      {
        path_prefix: prefix,
        count: routes.length,
        routes: routes,
        note: "This catalog describes every matching Rails route. Use the purpose-built MCP tools for actual data access."
      }
    end

    def mcp_capability_matrix(args)
      include_routes = args.key?(:include_routes) ? truthy?(args[:include_routes]) : true
      routes_by_controller = Rails.application.routes.routes.each_with_object(Hash.new { |hash, key| hash[key] = [] }) do |route, hash|
        controller = route.defaults[:controller].to_s
        next unless controller.start_with?("api/")

        hash[controller] << Serializer.route(route)
      end

      known = capability_map
      rows = routes_by_controller.keys.sort.map do |controller|
        definition = known.fetch(controller, {
          status: "excluded",
          reason: "No curated MCP tool is exposed yet for this route group."
        })
        row = {
          controller: controller,
          status: definition[:status],
          tools: Array(definition[:tools]),
          reason: definition[:reason]
        }.compact
        row[:routes] = routes_by_controller[controller].first(12) if include_routes
        row
      end

      {
        generated_at: Time.current,
        summary: {
          route_groups: rows.length,
          curated_groups: rows.count { |row| row[:status] == "curated" },
          excluded_groups: rows.count { |row| row[:status] == "excluded" }
        },
        capabilities: rows
      }
    end

    def workspace_autopilot_plan(args)
      days_ahead = bounded_limit(args[:days_ahead], default: 7, max: 30)
      build_workspace_autopilot_plan(days_ahead)
    end

    def render_workspace_autopilot(args)
      plan = workspace_autopilot_plan(args)
      {
        plan: plan,
        _meta: {
          plan: plan,
          generated_at: plan[:generated_at]
        }
      }
    end

    def workspace_autopilot_apply(args)
      ensure_write_allowed!
      action_ids = Array(args[:action_ids]).map(&:to_s).map(&:strip).reject(&:blank?).uniq
      raise ToolError, "action_ids is required" if action_ids.empty?

      days_ahead = bounded_limit(args[:days_ahead], default: 7, max: 30)
      plan = build_workspace_autopilot_plan(days_ahead)
      actions = plan[:actions].index_by { |action| action[:id] }
      unknown_ids = action_ids - actions.keys
      raise ToolError, "Unknown or no longer eligible action_ids: #{unknown_ids.join(', ')}" if unknown_ids.any?

      applied = action_ids.map { |action_id| apply_autopilot_action(actions.fetch(action_id)) }

      {
        applied_count: applied.length,
        applied: applied,
        audit_logs: applied.filter_map { |item| item[:audit_log] }
      }
    end

    def search_everything(args)
      query = args[:q].to_s.strip
      raise ToolError, "q must be at least 2 characters" if query.length < 2

      limit = bounded_limit(args[:limit], default: 30, max: 60)
      types = Array(args[:types].presence || DEFAULT_SEARCH_TYPES)
        .map(&:to_s)
        .intersection(DEFAULT_SEARCH_TYPES)
      pattern = "%#{ActiveRecord::Base.sanitize_sql_like(query)}%"

      results = types.flat_map do |type|
        send("search_#{type}", pattern)
      end.sort_by { |item| item[:updated_at] || Time.at(0) }.reverse.first(limit)

      {
        query: query,
        types: types,
        count: results.length,
        results: results
      }
    end

    def list_posts(args)
      scope = Post.includes(:user, :comments, :post_likes).order(created_at: :desc)
      if args[:q].present?
        pattern = "%#{ActiveRecord::Base.sanitize_sql_like(args[:q].to_s.strip)}%"
        scope = scope.where("message ILIKE ?", pattern)
      end
      records = scope.limit(bounded_limit(args[:limit], default: 30, max: 100))

      collection_payload(records.map { |post| Serializer.post(post, current_user: user) })
    end

    def create_post(args)
      ensure_write_allowed!
      post = user.posts.create!(message: required_string(args, :message))
      { post: Serializer.post(post.reload, current_user: user) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def create_comment(args)
      ensure_write_allowed!
      post = Post.find(required_id(args, :post_id))
      comment = post.comments.create!(user: user, body: required_string(args, :body))
      { comment: Serializer.comment(comment.reload), post: Serializer.post(post.reload, current_user: user) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def like_post(args)
      ensure_write_allowed!
      post = Post.find(required_id(args, :post_id))
      liked = args.key?(:liked) ? truthy?(args[:liked]) : true
      if liked
        post.post_likes.find_or_create_by!(user: user)
      else
        post.post_likes.where(user: user).destroy_all
      end

      { post: Serializer.post(post.reload, current_user: user), liked: liked }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def list_people(args)
      scope = user.workspace.users.includes(:department, :roles).order(:first_name, :last_name)
      if args[:q].present?
        pattern = "%#{ActiveRecord::Base.sanitize_sql_like(args[:q].to_s.strip)}%"
        scope = scope.left_outer_joins(:department).where(
          "users.first_name ILIKE :pattern OR users.last_name ILIKE :pattern OR users.email ILIKE :pattern OR users.job_title ILIKE :pattern OR departments.name ILIKE :pattern",
          pattern: pattern
        )
      end

      records = scope.limit(bounded_limit(args[:limit], default: 50, max: 100))
      collection_payload(records.map { |record| Serializer.user(record) })
    end

    def list_departments(args)
      records = Department.includes(:manager, :users)
        .order(:name)
        .limit(bounded_limit(args[:limit], default: 50, max: 100))

      collection_payload(records.map { |department| Serializer.department(department) })
    end

    def list_projects(args)
      scope = Project.includes(:owner, :project_users, :tasks, :issues).order(:name)
      scope = scope.where(status: args[:status]) if args[:status].present?
      records = scope.limit(bounded_limit(args[:limit], default: 50, max: 100))

      collection_payload(records.map { |project| Serializer.project(project) })
    end

    def list_project_members(args)
      scope = ProjectUser.includes(:project, user: [:department, :roles]).order(updated_at: :desc)
      scope = scope.where(project_id: args[:project_id]) if args[:project_id].present?
      records = scope.limit(bounded_limit(args[:limit], default: 80, max: 150))

      collection_payload(records.map { |project_user| Serializer.project_user(project_user) })
    end

    def add_project_member(args)
      ensure_project_write_allowed!
      project = Project.find(required_id(args, :project_id))
      member = assert_workspace_user!(required_id(args, :user_id))
      project_user = project.project_users.find_or_initialize_by(user: member)
      project_user.assign_attributes(project_member_attrs(args))
      project_user.save!

      { project_user: Serializer.project_user(project_user.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def update_project_member(args)
      ensure_project_write_allowed!
      project_user = ProjectUser.find(required_id(args, :id))
      assert_workspace_user!(args[:user_id]) if args[:user_id].present?
      project_user.update!(project_member_attrs(args))

      { project_user: Serializer.project_user(project_user.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def list_project_environments(args)
      scope = ProjectEnvironment.includes(:project, :project_vault_items).order(:name)
      scope = scope.where(project_id: args[:project_id]) if args[:project_id].present?
      records = scope.limit(bounded_limit(args[:limit], default: 80, max: 150))

      collection_payload(records.map { |environment| Serializer.project_environment(environment) })
    end

    def create_project_environment(args)
      ensure_project_write_allowed!
      project = Project.find(required_id(args, :project_id))
      environment = project.project_environments.create!(project_environment_attrs(args))

      { project_environment: Serializer.project_environment(environment.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def list_project_vault_items(args)
      scope = ProjectVaultItem.includes(:project, :project_environment).order(updated_at: :desc)
      scope = scope.where(project_id: args[:project_id]) if args[:project_id].present?
      scope = scope.where(category: args[:category]) if args[:category].present?
      records = scope.limit(bounded_limit(args[:limit], default: 80, max: 150))

      {
        count: records.length,
        records: records.map { |item| Serializer.project_vault_item(item) },
        note: "Only vault metadata is exposed. Secret content, usernames, tokens, and raw credentials are not returned."
      }
    end

    def get_project(args)
      project = Project.includes(
        :owner,
        :project_environments,
        :project_vault_items,
        :calendar_events,
        project_users: { user: [:department, :roles] },
        sprints: [],
        tasks: [:project, :sprint, :developer, :assigned_user],
        issues: [:project, :assignee_user, :reporter]
      ).find(required_id(args, :project_id))

      { project: Serializer.project_detail(project) }
    end

    def create_project(args)
      ensure_project_write_allowed!
      project = Project.new(project_attrs(args))
      project.owner = user

      Project.transaction do
        project.save!
        project.project_users.find_or_create_by!(user: user) do |project_user|
          project_user.role = "owner"
          project_user.status = "active"
          project_user.allocation_percentage = 100
          project_user.workload_status = "partial"
        end
      end

      { project: Serializer.project_detail(project.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def update_project(args)
      ensure_project_write_allowed!
      project = Project.find(required_id(args, :project_id))
      project.update!(project_attrs(args))
      { project: Serializer.project_detail(project.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def list_task_logs(args)
      start_date = parse_date(args[:start_date], default: 30.days.ago.to_date)
      end_date = parse_date(args[:end_date], default: Time.zone.today)
      scope = TaskLog.includes(:task, developer: [:department, :roles])
        .where(log_date: start_date..end_date)
        .order(log_date: :desc, updated_at: :desc)
      scope = scope.where(task_id: args[:task_id]) if args[:task_id].present?
      scope = scope.where(developer_id: args[:developer_id]) if args[:developer_id].present?
      scope = scope.joins(:task).where(tasks: { project_id: args[:project_id] }) if args[:project_id].present?
      records = scope.limit(bounded_limit(args[:limit], default: 80, max: 150))

      collection_payload(records.map { |log| Serializer.task_log(log) })
    end

    def create_task_log(args)
      ensure_write_allowed!
      task = Task.find(required_id(args, :task_id))
      developer = assert_workspace_user!(required_id(args, :developer_id))
      log = TaskLog.create!(
        task: task,
        developer: developer,
        log_date: parse_date(required_string(args, :log_date), default: nil),
        hours_logged: required_decimal(args, :hours_logged),
        type: args[:type].presence || "Code",
        status: args[:status].presence || "done"
      )

      { task_log: Serializer.task_log(log.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def list_sprints(args)
      scope = Sprint.includes(:project, :tasks).order(start_date: :desc)
      scope = scope.where(project_id: args[:project_id]) if args[:project_id].present?
      scope = scope.where(status: args[:status]) if args[:status].present?
      records = scope.limit(bounded_limit(args[:limit], default: 50, max: 100))

      collection_payload(records.map { |sprint| Serializer.sprint(sprint) })
    end

    def create_sprint(args)
      ensure_write_allowed!
      project = Project.find(required_id(args, :project_id))
      sprint = project.sprints.create!(record_attrs(args, sprint_keys))
      { sprint: Serializer.sprint(sprint.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def update_sprint(args)
      ensure_write_allowed!
      sprint = Sprint.find(required_id(args, :sprint_id))
      sprint.update!(record_attrs(args, sprint_keys))
      { sprint: Serializer.sprint(sprint.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def export_sprint_tasks(args)
      ensure_write_allowed!
      sprint = Sprint.includes(:project).find(required_id(args, :sprint_id))
      tasks = Task.where(sprint_id: sprint.id).order(:developer_id, :start_date)

      service = TaskSheetService.new(sprint.name, sprint.project.sheet_id)
      service.export_tasks(tasks, title: sprint_sheet_title(sprint))
      audit = audit_mcp_action!(
        "export_sprint_tasks",
        "export_tasks",
        sprint_id: sprint.id,
        project_id: sprint.project_id,
        task_count: tasks.size,
        sheet_name: sprint.name
      )

      {
        exported: true,
        sprint: Serializer.sprint(sprint.reload),
        project_id: sprint.project_id,
        sheet_name: sprint.name,
        task_count: tasks.size,
        audit_log: Serializer.mcp_audit_log(audit)
      }
    rescue ToolError
      raise
    rescue ActiveRecord::RecordNotFound
      raise ToolError, "Sprint #{args[:sprint_id]} was not found in this workspace."
    rescue StandardError => e
      raise ToolError, "Sprint task export failed: #{e.message}"
    end

    def list_tasks(args)
      scope = Task.includes(:project, :sprint, :developer, :assigned_user)
        .where("type != :general OR created_by = :user_id OR assigned_to_user = :user_id", general: "general", user_id: user.id)
        .order(updated_at: :desc)
      scope = scope.where(project_id: args[:project_id]) if args[:project_id].present?
      scope = scope.where(sprint_id: args[:sprint_id]) if args[:sprint_id].present?
      scope = scope.where(assigned_to_user: args[:assigned_to_user]) if args[:assigned_to_user].present?
      scope = scope.where(status: args[:status]) if args[:status].present?
      scope = scope.where(type: args[:type]) if args[:type].present?

      records = scope.limit(bounded_limit(args[:limit], default: 50, max: 100))
      collection_payload(records.map { |task| Serializer.task(task) })
    end

    def create_task(args)
      ensure_write_allowed!
      attrs = task_attrs(args)
      attrs[:type] = attrs[:type].presence || "general"
      attrs[:created_by] = user.id
      attrs[:updated_by] = user.id
      attrs[:task_id] = "MCP-#{SecureRandom.hex(3).upcase}" if attrs[:type] != "general" && attrs[:task_id].blank?
      assert_workspace_record!(Project, attrs[:project_id]) if attrs[:project_id].present?
      assert_workspace_record!(Sprint, attrs[:sprint_id]) if attrs[:sprint_id].present?
      assert_workspace_user!(attrs[:developer_id]) if attrs[:developer_id].present?
      assert_workspace_user!(attrs[:assigned_to_user]) if attrs[:assigned_to_user].present?

      task = Task.create!(attrs)
      { task: Serializer.task(task.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def update_task(args)
      ensure_write_allowed!
      task = Task.find(required_id(args, :id))
      attrs = task_attrs(args)
      assert_workspace_record!(Project, attrs[:project_id]) if attrs[:project_id].present?
      assert_workspace_record!(Sprint, attrs[:sprint_id]) if attrs[:sprint_id].present?
      assert_workspace_user!(attrs[:developer_id]) if attrs[:developer_id].present?
      assert_workspace_user!(attrs[:assigned_to_user]) if attrs[:assigned_to_user].present?
      attrs[:updated_by] = user.id
      task.update!(attrs)
      { task: Serializer.task(task.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def list_issues(args)
      scope = Issue.includes(:project, :assignee_user, :reporter).order(updated_at: :desc)
      scope = scope.where(project_id: args[:project_id]) if args[:project_id].present?
      scope = scope.where(status: args[:status]) if args[:status].present?
      scope = scope.where(severity: args[:severity]) if args[:severity].present?
      scope = scope.where(assignee_user_id: args[:assignee_user_id]) if args[:assignee_user_id].present?

      records = scope.limit(bounded_limit(args[:limit], default: 50, max: 100))
      collection_payload(records.map { |issue| Serializer.issue(issue) })
    end

    def create_issue(args)
      ensure_write_allowed!
      attrs = issue_attrs(args)
      assert_workspace_record!(Project, attrs[:project_id])
      attrs[:reporter_id] ||= user.id
      assert_workspace_user!(attrs[:reporter_id]) if attrs[:reporter_id].present?
      assert_workspace_user!(attrs[:assignee_user_id]) if attrs[:assignee_user_id].present?
      issue = Issue.create!(attrs)
      { issue: Serializer.issue(issue.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def update_issue(args)
      ensure_write_allowed!
      issue = Issue.find(required_id(args, :id))
      attrs = issue_attrs(args)
      assert_workspace_record!(Project, attrs[:project_id]) if attrs[:project_id].present?
      assert_workspace_user!(attrs[:reporter_id]) if attrs[:reporter_id].present?
      assert_workspace_user!(attrs[:assignee_user_id]) if attrs[:assignee_user_id].present?
      issue.update!(attrs)
      { issue: Serializer.issue(issue.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def list_calendar_events(args)
      start_time = parse_time(args[:start_date], default: Time.current.beginning_of_day)
      end_time = parse_time(args[:end_date], default: 14.days.from_now.end_of_day)
      scope = accessible_events(start_time, end_time).includes(:user, :project, :event_reminders).order(:start_at)
      scope = scope.where(project_id: args[:project_id]) if args[:project_id].present?
      records = scope.limit(bounded_limit(args[:limit], default: 80, max: 150))

      collection_payload(records.map { |event| Serializer.calendar_event(event) })
    end

    def create_calendar_event(args)
      ensure_write_allowed!
      attrs = calendar_event_attrs(args)
      attrs[:user_id] = user.id
      attrs[:event_type] = attrs[:event_type].presence || "meeting"
      attrs[:visibility] = attrs[:visibility].presence || "personal"
      attrs[:status] = attrs[:status].presence || "scheduled"
      attrs[:recurrence_rule] = attrs[:recurrence_rule].presence || "none"
      assert_workspace_record!(Project, attrs[:project_id]) if attrs[:project_id].present?
      assert_workspace_record!(Task, attrs[:task_id]) if attrs[:task_id].present?
      assert_workspace_record!(Sprint, attrs[:sprint_id]) if attrs[:sprint_id].present?
      event = CalendarEvent.create!(attrs)
      { calendar_event: Serializer.calendar_event(event.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def update_calendar_event(args)
      ensure_write_allowed!
      event = accessible_events(Time.zone.at(0), 50.years.from_now).find(required_id(args, :id))
      attrs = calendar_event_attrs(args)
      assert_workspace_record!(Project, attrs[:project_id]) if attrs[:project_id].present?
      assert_workspace_record!(Task, attrs[:task_id]) if attrs[:task_id].present?
      assert_workspace_record!(Sprint, attrs[:sprint_id]) if attrs[:sprint_id].present?
      event.update!(attrs)
      { calendar_event: Serializer.calendar_event(event.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def daily_momentum
      today = Time.zone.today
      yesterday = today - 1.day
      user_tasks = Task.where(assigned_to_user: user.id).or(Task.where(created_by: user.id)).includes(:project, :sprint)
      recent_logs = WorkLog.includes(:category, :priority, :tags).where(user: user, log_date: (today - 30.days)..today)
      yesterday_logs = WorkLog.includes(:category).where(user: user, log_date: yesterday)

      {
        generated_at: Time.current,
        date: today,
        morning_briefing: {
          overdue_tasks: user_tasks.where.not(end_date: nil).where("end_date < ?", today).where.not(status: Serializer.completed_statuses).order(:end_date).limit(6).map { |task| Serializer.task(task) },
          focus_tasks: user_tasks.where("(start_date IS NULL OR start_date <= ?)", today).where("(end_date IS NULL OR end_date >= ?)", today).where(status: %w[todo in_progress doing blocked reviewing qa backlog]).limit(6).map { |task| Serializer.task(task) },
          needs_triage: Task.where(created_by: user.id).where("assigned_to_user IS NULL OR sprint_id IS NULL").order(updated_at: :desc).limit(6).map { |task| Serializer.task(task) },
          meetings: recent_logs.where(log_date: today).select { |log| log.category&.name.to_s.downcase.include?("meeting") }.map { |log| Serializer.work_log(log) }
        },
        rapid_logging: {
          recent_log_titles: recent_logs.order(updated_at: :desc).limit(3).pluck(:title),
          top_categories: top_work_categories(recent_logs),
          top_tags: top_work_tags(recent_logs)
        },
        learning_nudge: {
          due_card: user.knowledge_bookmarks.due_for_reminder.order(:next_reminder_at).limit(1).map { |bookmark| Serializer.knowledge_bookmark(bookmark) }.first,
          total_due: user.knowledge_bookmarks.due_for_reminder.count
        },
        reflection: {
          yesterday_logs_count: yesterday_logs.size,
          yesterday_total_minutes: total_minutes(yesterday_logs),
          yesterday_note: user.work_notes.find_by(note_date: yesterday)&.content,
          blockers: user_tasks.where(status: "blocked").limit(5).map { |task| Serializer.task(task) }
        }
      }
    end

    def list_work_logs(args)
      start_date = parse_date(args[:start_date], default: 30.days.ago.to_date)
      end_date = parse_date(args[:end_date], default: Time.zone.today)
      target_user_id = args[:user_id].presence || user.id
      assert_workspace_user!(target_user_id)

      scope = WorkLog.includes(:user, :category, :priority, :tags)
        .where(user_id: target_user_id, log_date: start_date..end_date)
        .order(log_date: :desc, start_time: :desc)
      records = scope.limit(bounded_limit(args[:limit], default: 80, max: 150))

      collection_payload(records.map { |log| Serializer.work_log(log) })
    end

    def create_work_log(args)
      ensure_write_allowed!
      attrs = work_log_attrs(args)
      attrs[:user_id] = attrs[:user_id].presence || user.id
      assert_workspace_user!(attrs[:user_id])
      assert_workspace_record!(WorkCategory, attrs[:category_id]) if attrs[:category_id].present?
      assert_workspace_record!(WorkPriority, attrs[:priority_id]) if attrs[:priority_id].present?
      log = WorkLog.create!(attrs)
      { work_log: Serializer.work_log(log.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def update_work_log(args)
      ensure_write_allowed!
      log = WorkLog.find(required_id(args, :id))
      attrs = work_log_attrs(args)
      assert_workspace_user!(attrs[:user_id]) if attrs[:user_id].present?
      assert_workspace_record!(WorkCategory, attrs[:category_id]) if attrs[:category_id].present?
      assert_workspace_record!(WorkPriority, attrs[:priority_id]) if attrs[:priority_id].present?
      log.update!(attrs)
      { work_log: Serializer.work_log(log.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def list_work_taxonomy(args)
      type = args[:type].to_s.presence
      limit = bounded_limit(args[:limit], default: 80, max: 150)
      types = type.present? ? [type] : %w[category priority tag]

      {
        records: types.index_with do |kind|
          model = work_taxonomy_model(kind)
          model.order(:name).limit(limit).map { |record| Serializer.work_taxonomy(record) }
        end
      }
    end

    def create_work_taxonomy_item(args)
      ensure_write_allowed!
      model = work_taxonomy_model(required_string(args, :type))
      attrs = work_taxonomy_attrs(args, model)
      record = model.create!(attrs)

      { record: Serializer.work_taxonomy(record.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def update_work_taxonomy_item(args)
      ensure_write_allowed!
      model = work_taxonomy_model(required_string(args, :type))
      record = model.find(required_id(args, :id))
      record.update!(work_taxonomy_attrs(args, model))

      { record: Serializer.work_taxonomy(record.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def list_work_notes(args)
      start_date = parse_date(args[:start_date], default: 30.days.ago.to_date)
      end_date = parse_date(args[:end_date], default: Time.zone.today)
      target_user_id = args[:user_id].presence || user.id
      assert_workspace_user!(target_user_id)
      records = WorkNote.includes(:user)
        .where(user_id: target_user_id, note_date: start_date..end_date)
        .order(note_date: :desc)
        .limit(bounded_limit(args[:limit], default: 80, max: 150))

      collection_payload(records.map { |note| Serializer.work_note(note) })
    end

    def create_work_note(args)
      ensure_write_allowed!
      target_user_id = args[:user_id].presence || user.id
      assert_workspace_user!(target_user_id)
      note = WorkNote.find_or_initialize_by(user_id: target_user_id, note_date: parse_date(required_string(args, :note_date), default: nil))
      note.content = required_string(args, :content)
      note.save!

      { work_note: Serializer.work_note(note.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def update_work_note(args)
      ensure_write_allowed!
      note = WorkNote.find(required_id(args, :id))
      attrs = work_note_attrs(args)
      assert_workspace_user!(attrs[:user_id]) if attrs[:user_id].present?
      note.update!(attrs)

      { work_note: Serializer.work_note(note.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def list_teams(args)
      records = Team.includes(:owner, :learning_goals, team_users: { user: [:department, :roles] })
        .order(:name)
        .limit(bounded_limit(args[:limit], default: 50, max: 100))

      collection_payload(records.map { |team| Serializer.team(team) })
    end

    def list_skills(args)
      scope = Skill.includes(user_skills: { user: [:department, :roles] }).alphabetical
      if args[:q].present?
        pattern = "%#{ActiveRecord::Base.sanitize_sql_like(args[:q].to_s.strip)}%"
        scope = scope.where("name ILIKE ? OR category ILIKE ?", pattern, pattern)
      end
      records = scope.limit(bounded_limit(args[:limit], default: 80, max: 150))

      collection_payload(records.map { |skill| Serializer.skill(skill) })
    end

    def list_learning_goals(args)
      scope = LearningGoal.includes(:user, :team, :learning_checkpoints).ordered
      scope = scope.where(user_id: args[:user_id]) if args[:user_id].present?
      scope = scope.where(team_id: args[:team_id]) if args[:team_id].present?
      records = scope.limit(bounded_limit(args[:limit], default: 50, max: 100))

      collection_payload(records.map { |goal| Serializer.learning_goal(goal) })
    end

    def portfolio_snapshot
      profile = PortfolioProfile.published.first
      projects = PortfolioProject.published.ordered.includes(:portfolio_features)

      {
        profile: Serializer.portfolio_profile(profile),
        projects: projects.map { |project| Serializer.portfolio_project(project) }
      }
    end

    def list_knowledge_bookmarks(args)
      scope = user.knowledge_bookmarks.order(updated_at: :desc)
      scope = scope.due_for_reminder if truthy?(args[:due_only])
      records = scope.limit(bounded_limit(args[:limit], default: 50, max: 100))

      collection_payload(records.map { |bookmark| Serializer.knowledge_bookmark(bookmark) })
    end

    def create_knowledge_bookmark(args)
      ensure_write_allowed!
      card_type = required_string(args, :card_type)
      payload = safe_hash(args[:payload])
      source_id = args[:source_id].presence || knowledge_source_key(card_type: card_type, payload: payload)
      bookmark = user.knowledge_bookmarks.find_or_initialize_by(card_type: card_type, source_id: source_id)
      bookmark.assign_attributes(
        collection_name: args[:collection_name],
        payload: payload,
        reminder_interval_days: args[:reminder_interval_days].presence || 7
      )
      bookmark.save!

      { knowledge_bookmark: Serializer.knowledge_bookmark(bookmark.reload) }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def list_knowledge_items(args)
      scope = user.knowledge_items.includes(:knowledge_prompt_run).latest_first
      scope = scope.where(active: truthy?(args[:active])) if args.key?(:active)
      scope = scope.where(category: args[:category]) if args[:category].present?
      scope = scope.where(collection_name: args[:collection_name]) if args[:collection_name].present?
      records = scope.limit(bounded_limit(args[:limit], default: 50, max: 100))

      collection_payload(records.map { |item| Serializer.knowledge_item(item) })
    end

    def create_knowledge_items(args)
      ensure_write_allowed!
      mode = (args[:mode].presence || args[:generation_mode].presence || "history").to_s
      raise ToolError, "mode must be history, replace_topic, or replace_all" unless KnowledgePromptRun::GENERATION_MODES.include?(mode)

      items = Array(args[:items])
      raise ToolError, "items must include at least one knowledge card" if items.empty?
      raise ToolError, "items cannot exceed 20 cards per call" if items.length > 20

      created = []
      archived_count = 0
      run = nil

      KnowledgePromptRun.transaction do
        run = user.knowledge_prompt_runs.create!(
          prompt: required_string(args, :prompt),
          source: args[:source].presence || "mcp",
          generation_mode: mode,
          status: "completed",
          mcp_access_token: token,
          metadata: safe_hash(args[:metadata]).merge("collection_name" => args[:collection_name])
        )

        if mode == "replace_all"
          scope = user.knowledge_items.active.joins(:knowledge_prompt_run).where(knowledge_prompt_runs: { source: run.source })
          archived_count += archive_knowledge_scope(scope)
        end

        items.each_with_index do |raw_item, index|
          attrs = knowledge_item_attrs(safe_hash(raw_item).with_indifferent_access, index, run)
          replacement_scope = user.knowledge_items.active.where(source_key: attrs[:source_key]).to_a if mode == "replace_topic"

          item = user.knowledge_items.create!(attrs.merge(knowledge_prompt_run: run))
          created << item
          archived_count += archive_knowledge_scope(replacement_scope, replacement: item) if replacement_scope
        end
      end

      audit_mcp_action!(
        "create_knowledge_items",
        mode,
        knowledge_prompt_run_id: run.id,
        item_count: created.length,
        archived_count: archived_count
      )

      {
        knowledge_prompt_run: Serializer.knowledge_prompt_run(run.reload),
        archived_count: archived_count,
        knowledge_items: created.map { |item| Serializer.knowledge_item(item.reload) }
      }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def list_conversations(args)
      records = Conversation.for_user(user)
        .includes(:conversation_participants, participants: [:department, :roles], messages: :user)
        .order(updated_at: :desc)
        .limit(bounded_limit(args[:limit], default: 30, max: 100))

      collection_payload(records.map { |conversation| Serializer.conversation(conversation, current_user: user) })
    end

    def send_chat_message(args)
      ensure_write_allowed!
      conversation = Conversation.for_user(user).find(required_id(args, :conversation_id))
      message = conversation.messages.create!(
        user: user,
        body: required_string(args, :body)
      )
      conversation.touch
      Chat::ReceiptManager.new(user: user).update(
        conversation: conversation,
        message_id: message.id,
        state: "read"
      )

      {
        message: {
          id: message.id,
          conversation_id: conversation.id,
          body: message.body,
          user: Serializer.user(message.user),
          created_at: message.created_at
        }
      }
    rescue ActiveRecord::RecordInvalid => e
      raise ToolError, validation_message(e.record)
    end

    def list_notifications(args)
      scope = user.notifications.includes(:actor).recent
      scope = scope.unread if truthy?(args[:unread_only])
      records = scope.limit(bounded_limit(args[:limit], default: 50, max: 100))

      collection_payload(records.map { |notification| Serializer.notification(notification) })
    end

    def mark_notification_read(args)
      ensure_write_allowed!
      notification = user.notifications.find(required_id(args, :id))
      notification.mark_as_read!
      { notification: Serializer.notification(notification.reload) }
    end

    def list_pdf_documents(args)
      records = user.pdf_documents
        .includes(:current_version, :versions, :operations)
        .order(updated_at: :desc)
        .limit(bounded_limit(args[:limit], default: 50, max: 100))

      {
        count: records.length,
        storage_bytes_for_user: PdfDocument.storage_bytes_for(user),
        records: records.map { |document| Serializer.pdf_document(document) }
      }
    end

    def get_pdf_document_text(args)
      document = user.pdf_documents.includes(current_version: { file_attachment: :blob }).find(required_id(args, :id))
      raise ToolError, "PDF document has no current version." unless document.current_version&.file&.attached?
      raise ToolError, "Encrypted PDFs must be unlocked before text extraction." if document.current_version.encrypted?

      max_chars = bounded_limit(args[:max_chars], default: 12_000, max: 50_000)
      text = nil
      document.current_version.file.open do |file|
        stdout, stderr, status = Open3.capture3("pdftotext", "-layout", "-enc", "UTF-8", file.path, "-")
        raise ToolError, "Text extraction failed: #{stderr.presence || 'pdftotext returned an error'}" unless status.success?

        text = stdout.encode("UTF-8", invalid: :replace, undef: :replace, replace: "")
      end

      {
        document: Serializer.pdf_document(document),
        chars: text.length,
        truncated: text.length > max_chars,
        text: text.first(max_chars)
      }
    rescue Errno::ENOENT
      raise ToolError, "pdftotext is not available on this machine."
    end

    def list_pdf_operations(args)
      scope = user.pdf_document_operations.includes(:pdf_document, :artifacts).order(created_at: :desc)
      scope = scope.where(pdf_document_id: args[:pdf_document_id]) if args[:pdf_document_id].present?
      scope = scope.where(status: args[:status]) if args[:status].present?
      records = scope.limit(bounded_limit(args[:limit], default: 50, max: 100))

      collection_payload(records.map { |operation| Serializer.pdf_operation(operation) })
    end

    def keka_profile_summary
      profile = user.keka_profile_data.to_h
      {
        configured: user.keka_base_url.present? && user.encrypted_keka_api_key.present?,
        employee_id: user.keka_employee_id,
        last_synced_at: user.keka_last_synced_at,
        profile: profile.slice("displayName", "firstName", "lastName", "email", "jobTitle", "department", "location", "manager"),
        blocked_fields: %w[keka_api_key encrypted_keka_api_key encrypted_keka_api_key_iv]
      }
    end

    def repo_apply_patch(args)
      ensure_repo_write_allowed!
      RepoTools.apply_patch(args)
    end

    def repo_write_file(args)
      ensure_repo_write_allowed!
      RepoTools.write_file(args)
    end

    def repo_diff(args)
      ensure_repo_read_allowed!
      RepoTools.diff(args)
    end

    def repo_commit(args)
      ensure_repo_write_allowed!
      RepoTools.commit(args)
    end

    def run_tests(args)
      ensure_repo_read_allowed!
      ensure_code_tools_enabled!
      RepoTools.run_tests(args)
    end

    def db_query(args)
      ensure_db_query_allowed!
      RuntimeTools.db_query(args)
    end

    def rails_runner(args)
      ensure_rails_runtime_allowed!
      RuntimeTools.rails_runner(args)
    end

    def rails_console(args)
      ensure_rails_runtime_allowed!
      RuntimeTools.rails_console(args)
    end

    def search_projects(pattern)
      Project.where("name ILIKE ? OR description ILIKE ?", pattern, pattern)
        .order(updated_at: :desc)
        .limit(8)
        .map { |project| search_result("project", project.id, project.name, project.description, "/projects/#{project.id}/dashboard", project.updated_at) }
    end

    def search_tasks(pattern)
      Task.where("title ILIKE ? OR task_id ILIKE ? OR description ILIKE ?", pattern, pattern, pattern)
        .where("type != :general OR created_by = :user_id OR assigned_to_user = :user_id", general: "general", user_id: user.id)
        .includes(:project)
        .order(updated_at: :desc)
        .limit(8)
        .map do |task|
          search_result(
            "task",
            task.id,
            task.title.presence || task.task_id,
            task.project&.name || task.status,
            task.project_id ? "/projects/#{task.project_id}/dashboard?task_id=#{task.id}" : "/momentum",
            task.updated_at
          )
        end
    end

    def search_issues(pattern)
      Issue.where("title ILIKE ? OR issue_key ILIKE ? OR issue_description ILIKE ?", pattern, pattern, pattern)
        .includes(:project)
        .order(updated_at: :desc)
        .limit(8)
        .map { |issue| search_result("issue", issue.id, "#{issue.issue_key}: #{issue.title}", issue.project&.name, "/projects/#{issue.project_id}/issues?issue_id=#{issue.id}", issue.updated_at) }
    end

    def search_users(pattern)
      user.workspace.users.where("first_name ILIKE ? OR last_name ILIKE ? OR email ILIKE ? OR job_title ILIKE ?", pattern, pattern, pattern, pattern)
        .order(updated_at: :desc)
        .limit(8)
        .map { |record| search_result("user", record.id, record.full_name, record.job_title, "/profile/#{record.id}", record.updated_at) }
    end

    def search_posts(pattern)
      Post.where("message ILIKE ?", pattern)
        .includes(:user)
        .order(updated_at: :desc)
        .limit(8)
        .map { |post| search_result("post", post.id, post.message.to_s.truncate(80), post.user&.full_name, "/posts#post-#{post.id}", post.updated_at) }
    end

    def search_knowledge(pattern)
      user.knowledge_bookmarks
        .where("payload::text ILIKE ? OR collection_name ILIKE ?", pattern, pattern)
        .order(updated_at: :desc)
        .limit(8)
        .map do |bookmark|
          payload = bookmark.payload.to_h
          title = payload["title"] || payload["headline"] || bookmark.card_type.humanize
          search_result("knowledge", bookmark.id, title, bookmark.collection_name, "/knowledge?bookmark_id=#{bookmark.id}", bookmark.updated_at)
        end
    end

    def search_result(type, id, title, subtitle, path, updated_at)
      {
        type: type,
        id: id,
        title: title,
        subtitle: subtitle.to_s.truncate(140),
        path: path,
        updated_at: updated_at
      }
    end

    def accessible_events(start_time, end_time)
      project_ids = user.projects.select(:id)
      CalendarEvent
        .where(user_id: user.id)
        .or(CalendarEvent.where(visibility: "project", project_id: project_ids))
        .within_range(start_time, end_time)
        .distinct
    end

    def workspace_payload
      workspace = user.workspace
      {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        kind: workspace.kind,
        plan_key: workspace.plan_key,
        billing_status: workspace.billing_status,
        saas_plan: workspace.saas_plan
      }
    end

    def capability_map
      curated = lambda do |*tools|
        {
          status: "curated",
          tools: tools.flatten
        }
      end

      excluded = lambda do |reason|
        {
          status: "excluded",
          reason: reason
        }
      end

      {
        "api/activity" => curated.call("app_snapshot", "daily_workspace_briefing"),
        "api/admin" => excluded.call("Raw generic admin CRUD is intentionally blocked from MCP."),
        "api/admin/portfolio" => curated.call("portfolio_snapshot"),
        "api/admin_sessions" => excluded.call("Admin impersonation is intentionally blocked from MCP."),
        "api/auth" => excluded.call("Auth, login, refresh, and profile credential flows are intentionally blocked from MCP."),
        "api/calendar_events" => curated.call("list_calendar_events", "create_calendar_event", "update_calendar_event"),
        "api/comments" => curated.call("list_posts", "create_comment"),
        "api/contacts" => excluded.call("Public contact form is not useful for authenticated workspace MCP access."),
        "api/daily_momentum" => curated.call("daily_momentum"),
        "api/departments" => curated.call("list_departments"),
        "api/developers" => curated.call("list_people"),
        "api/event_reminders" => curated.call("list_calendar_events", "create_calendar_event", "update_calendar_event"),
        "api/issues" => curated.call("list_issues", "create_issue", "update_issue"),
        "api/keka" => curated.call("keka_profile_summary"),
        "api/knowledge_bookmarks" => curated.call("list_knowledge_bookmarks", "create_knowledge_bookmark"),
        "api/knowledge_items" => curated.call("list_knowledge_items", "create_knowledge_items"),
        "api/knowledge_prompt_runs" => curated.call("list_knowledge_items", "create_knowledge_items"),
        "api/learning_checkpoints" => curated.call("list_learning_goals"),
        "api/learning_goals" => curated.call("list_learning_goals"),
        "api/message_reactions" => curated.call("list_conversations"),
        "api/messages" => curated.call("send_chat_message"),
        "api/notifications" => curated.call("list_notifications", "mark_notification_read"),
        "api/passwords" => excluded.call("Password reset flows are intentionally blocked from MCP."),
        "api/pdf_document_operations" => curated.call("list_pdf_operations"),
        "api/pdf_documents" => curated.call("list_pdf_documents", "get_pdf_document_text"),
        "api/portfolio" => curated.call("portfolio_snapshot"),
        "api/posts" => curated.call("list_posts", "create_post", "create_comment", "like_post"),
        "api/project_environments" => curated.call("list_project_environments", "create_project_environment"),
        "api/project_users" => curated.call("list_project_members", "add_project_member", "update_project_member"),
        "api/project_vault_items" => curated.call("list_project_vault_items"),
        "api/projects" => curated.call("list_projects", "get_project", "create_project", "update_project"),
        "api/roles" => curated.call("list_people"),
        "api/search" => curated.call("search_everything"),
        "api/sheets" => excluded.call("Sheet API can expose external integration details; use project and issue tools instead."),
        "api/skills" => curated.call("list_skills"),
        "api/skill_endorsements" => curated.call("list_skills"),
        "api/sprints" => curated.call("list_sprints", "create_sprint", "update_sprint", "export_sprint_tasks"),
        "api/task_logs" => curated.call("list_task_logs", "create_task_log"),
        "api/tasks" => curated.call("list_tasks", "create_task", "update_task"),
        "api/team_users" => curated.call("list_teams"),
        "api/teams" => curated.call("list_teams", "list_skills", "list_learning_goals"),
        "api/users" => curated.call("list_people"),
        "api/user_skills" => curated.call("list_skills"),
        "api/work_categories" => curated.call("list_work_taxonomy", "create_work_taxonomy_item", "update_work_taxonomy_item"),
        "api/work_logs" => curated.call("list_work_logs", "create_work_log", "update_work_log"),
        "api/work_notes" => curated.call("list_work_notes", "create_work_note", "update_work_note"),
        "api/work_priorities" => curated.call("list_work_taxonomy", "create_work_taxonomy_item", "update_work_taxonomy_item"),
        "api/work_tags" => curated.call("list_work_taxonomy", "create_work_taxonomy_item", "update_work_taxonomy_item")
      }
    end

    def build_workspace_autopilot_plan(days_ahead)
      today = Time.zone.today
      future = days_ahead.days.from_now
      my_tasks = Task.includes(:project, :sprint)
        .where(assigned_to_user: user.id)
        .or(Task.where(created_by: user.id))

      overdue_tasks = my_tasks.where.not(status: Serializer.completed_statuses)
        .where.not(end_date: nil)
        .where("end_date < ?", today)
        .order(:end_date)
        .limit(8)
      blocked_tasks = my_tasks.where(status: "blocked").order(updated_at: :desc).limit(8)
      severe_issues = Issue.includes(:project, :assignee_user)
        .where(severity: %w[High Critical])
        .where.not(status: Serializer.closed_issue_statuses)
        .order(Arel.sql("CASE severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 ELSE 2 END"), :due_date)
        .limit(8)
      upcoming_events = accessible_events(Time.current, future).order(:start_at).limit(12)

      {
        generated_at: Time.current,
        window: {
          today: today,
          days_ahead: days_ahead
        },
        priorities: [
          priority_item("overdue_tasks", overdue_tasks.count, "Create focus blocks or reschedule tasks past their end date."),
          priority_item("blocked_tasks", blocked_tasks.count, "Resolve ownership or next-action gaps on blocked work."),
          priority_item("high_severity_issues", severe_issues.count, "Escalate high and critical QA issues before routine work."),
          priority_item("upcoming_events", upcoming_events.count, "Protect focus time around meetings and deadlines.")
        ].select { |item| item[:count].positive? },
        risks: autopilot_risks(overdue_tasks, blocked_tasks, severe_issues, upcoming_events),
        actions: autopilot_actions(overdue_tasks, blocked_tasks, severe_issues),
        future_feature_ideas: innovation_ideas
      }
    end

    def autopilot_risks(overdue_tasks, blocked_tasks, severe_issues, upcoming_events)
      [
        {
          kind: "delivery",
          title: "Overdue task pressure",
          description: "#{overdue_tasks.count} tasks are overdue for your current workspace.",
          severity: overdue_tasks.any? ? "medium" : "low"
        },
        {
          kind: "execution",
          title: "Blocked work",
          description: "#{blocked_tasks.count} assigned or created tasks are blocked.",
          severity: blocked_tasks.any? ? "high" : "low"
        },
        {
          kind: "quality",
          title: "High severity QA",
          description: "#{severe_issues.count} high or critical issues are still open.",
          severity: severe_issues.any? ? "high" : "low"
        },
        {
          kind: "calendar",
          title: "Calendar load",
          description: "#{upcoming_events.count} visible events are scheduled in this window.",
          severity: upcoming_events.count > 8 ? "medium" : "low"
        }
      ]
    end

    def autopilot_actions(overdue_tasks, blocked_tasks, severe_issues)
      focus_actions = overdue_tasks.first(5).map do |task|
        {
          id: "focus_task_#{task.id}",
          type: "create_focus_block",
          title: "Create a focus block for #{task.title.presence || task.task_id}",
          description: "Adds a one-hour personal focus calendar event for this overdue task.",
          task: Serializer.task(task),
          requires_approval: true
        }
      end

      triage_actions = blocked_tasks.first(5).map do |task|
        {
          id: "triage_task_#{task.id}",
          type: "move_task_to_in_progress",
          title: "Move blocked task into active triage",
          description: "Sets the task status to in_progress and assigns it to you if unassigned.",
          task: Serializer.task(task),
          requires_approval: true
        }
      end

      issue_actions = severe_issues.first(5).map do |issue|
        {
          id: "escalate_issue_#{issue.id}",
          type: "escalate_issue",
          title: "Escalate #{issue.issue_key}",
          description: "Sets the issue to Need to discuss and appends an autopilot escalation note.",
          issue: Serializer.issue(issue),
          requires_approval: true
        }
      end

      focus_actions + triage_actions + issue_actions
    end

    def apply_autopilot_action(action)
      case action[:type]
      when "create_focus_block"
        apply_focus_block_action(action)
      when "move_task_to_in_progress"
        apply_task_triage_action(action)
      when "escalate_issue"
        apply_issue_escalation_action(action)
      else
        raise ToolError, "Unsupported autopilot action type: #{action[:type]}"
      end
    end

    def apply_focus_block_action(action)
      task = Task.find(action.dig(:task, :id))
      start_at = next_focus_start
      event = CalendarEvent.find_or_create_by!(
        user: user,
        task: task,
        title: "Focus: #{task.title.presence || task.task_id}",
        start_at: start_at
      ) do |record|
        record.end_at = start_at + 1.hour
        record.event_type = "focus"
        record.visibility = "personal"
        record.status = "scheduled"
        record.description = "Created by Workspace Autopilot from ChatGPT MCP."
        record.project = task.project if task.project
        record.sprint = task.sprint if task.sprint
      end

      audit = audit_mcp_action!("workspace_autopilot_apply", "create_focus_block", action_id: action[:id], task_id: task.id, calendar_event_id: event.id)
      {
        action_id: action[:id],
        result: "created_or_found_focus_block",
        calendar_event: Serializer.calendar_event(event.reload),
        audit_log: Serializer.mcp_audit_log(audit)
      }
    end

    def apply_task_triage_action(action)
      task = Task.find(action.dig(:task, :id))
      attrs = { status: "in_progress", updated_by: user.id }
      attrs[:assigned_to_user] = user.id if task.assigned_to_user.blank?
      task.update!(attrs)

      audit = audit_mcp_action!("workspace_autopilot_apply", "move_task_to_in_progress", action_id: action[:id], task_id: task.id)
      {
        action_id: action[:id],
        result: "task_updated",
        task: Serializer.task(task.reload),
        audit_log: Serializer.mcp_audit_log(audit)
      }
    end

    def apply_issue_escalation_action(action)
      issue = Issue.find(action.dig(:issue, :id))
      note = "Escalated by Workspace Autopilot on #{Time.current.to_date}."
      issue.update!(
        status: "Need to discuss",
        comment: [issue.comment, note].compact_blank.join("\n")
      )

      audit = audit_mcp_action!("workspace_autopilot_apply", "escalate_issue", action_id: action[:id], issue_id: issue.id)
      {
        action_id: action[:id],
        result: "issue_escalated",
        issue: Serializer.issue(issue.reload),
        audit_log: Serializer.mcp_audit_log(audit)
      }
    end

    def next_focus_start
      base = Time.zone.now
      candidate = base.hour >= 17 ? 1.day.from_now.change(hour: 10, min: 0, sec: 0) : base.advance(hours: 1).change(min: 0, sec: 0)
      candidate.saturday? ? candidate.next_week(:monday).change(hour: 10) : candidate.sunday? ? candidate.next_week(:monday).change(hour: 10) : candidate
    end

    def audit_mcp_action!(tool_name, action, metadata = {})
      McpAuditLog.create!(
        workspace: user.workspace,
        user: user,
        mcp_access_token: token,
        tool_name: tool_name,
        action: action,
        metadata: metadata
      )
    end

    def innovation_ideas
      [
        {
          name: "Workspace autopilot",
          description: "A ChatGPT workflow that converts daily_workspace_briefing into proposed task moves, issue escalations, and calendar focus blocks."
        },
        {
          name: "Living project memory",
          description: "Use knowledge bookmarks, chat, issues, and work logs to produce a searchable decision timeline for each project."
        },
        {
          name: "Quality radar",
          description: "Combine QA issues, blocked tasks, sprint dates, and assignee load to predict delivery risk before standup."
        },
        {
          name: "Code-to-work loop",
          description: "With local repo tools enabled, ChatGPT can inspect source, propose a patch, then create matching tasks, test notes, and knowledge cards."
        }
      ]
    end

    def priority_item(kind, count, recommendation)
      {
        kind: kind,
        count: count,
        recommendation: recommendation
      }
    end

    def project_attrs(args)
      record_attrs(args, %i[name description start_date end_date qa_mode_enabled])
    end

    def sprint_keys
      %i[name start_date end_date status progress]
    end

    def sprint_sheet_title(sprint)
      return sprint.name if sprint.start_date.blank? || sprint.end_date.blank?

      total_days = (sprint.end_date - sprint.start_date).to_i + 1
      "#{sprint.name} : #{sprint.start_date.strftime('%m/%d/%Y')} - #{sprint.end_date.strftime('%m/%d/%Y')}  (#{total_days} Days)"
    end

    def task_attrs(args)
      record_attrs(
        args,
        %i[
          task_id task_url type title description status priority project_id sprint_id developer_id
          assigned_to_user start_date end_date estimated_hours qa_assigned internal_qa blocker demo
        ]
      )
    end

    def issue_attrs(args)
      record_attrs(
        args,
        %i[
          project_id issue_key title status severity category module_name sub_module issue_description
          pre_conditions repro_steps actual_result expected_result comment assignee_user_id reporter_id due_date
        ]
      )
    end

    def calendar_event_attrs(args)
      record_attrs(
        args,
        %i[
          title description start_at end_at all_day event_type visibility status location_or_meet_link
          project_id task_id sprint_id recurrence_rule recurrence_until
        ]
      )
    end

    def work_log_attrs(args)
      record_attrs(args, %i[user_id title description log_date start_time end_time category_id priority_id actual_minutes])
    end

    def project_member_attrs(args)
      attrs = record_attrs(args, %i[user_id role status allocation_percentage workload_status])
      attrs[:role] ||= "collaborator"
      attrs[:status] ||= "active"
      attrs[:allocation_percentage] = attrs[:allocation_percentage].to_i if attrs.key?(:allocation_percentage)
      attrs[:workload_status] ||= "partial"
      attrs
    end

    def project_environment_attrs(args)
      record_attrs(args, %i[name url description])
    end

    def work_note_attrs(args)
      attrs = record_attrs(args, %i[user_id note_date content])
      attrs[:note_date] = parse_date(attrs[:note_date], default: nil) if attrs[:note_date].present?
      attrs
    end

    def knowledge_item_attrs(args, index, run)
      title = required_string(args, :title)
      category = args[:category].presence || "learning"
      source_url = args[:source_url].presence || args[:url]
      source_key = args[:source_key].presence || KnowledgeItem.source_key_for(category: category, title: title, source_url: source_url)

      {
        title: title,
        summary: args[:summary],
        body: args[:body].presence || args[:content],
        category: category,
        item_type: args[:item_type].presence || "fact",
        collection_name: args[:collection_name].presence || run.metadata["collection_name"],
        source_name: args[:source_name],
        source_url: source_url,
        source_key: source_key,
        published_at: parse_time(args[:published_at], default: nil),
        tags: Array(args[:tags]).map(&:to_s).reject(&:blank?),
        payload: safe_hash(args[:payload]),
        position: args[:position].presence || index
      }
    end

    def archive_knowledge_scope(scope, replacement: nil)
      count = 0
      iterator = scope.respond_to?(:find_each) ? scope.method(:find_each) : ->(&block) { Array(scope).each(&block) }
      iterator.call do |item|
        item.archive!(replacement: replacement)
        count += 1
      end
      count
    end

    def knowledge_source_key(card_type:, payload:)
      Digest::SHA256.hexdigest({ card_type: card_type, payload: payload }.to_json)
    end

    def safe_hash(value)
      value.respond_to?(:to_h) ? value.to_h : {}
    end

    def work_taxonomy_attrs(args, model)
      keys = model == WorkTag ? %i[name] : %i[name color hex]
      record_attrs(args, keys)
    end

    def work_taxonomy_model(type)
      case type.to_s
      when "category", "work_category" then WorkCategory
      when "priority", "work_priority" then WorkPriority
      when "tag", "work_tag" then WorkTag
      else
        raise ToolError, "type must be category, priority, or tag"
      end
    end

    def top_work_categories(logs)
      counts = logs.where.not(category_id: nil)
        .group(:category_id)
        .order(Arel.sql("COUNT(*) DESC"))
        .limit(3)
        .count
      categories = WorkCategory.where(id: counts.keys).index_by(&:id)
      counts.map do |category_id, count|
        category = categories[category_id]
        {
          id: category_id,
          name: category&.name || "Uncategorized",
          color: category&.color,
          hex: category&.hex,
          count: count
        }
      end
    end

    def top_work_tags(logs)
      return [] unless logs.exists?

      WorkLogTag
        .joins(:work_tag)
        .where(work_log_id: logs.select(:id))
        .group(:work_tag_id, "work_tags.name")
        .order(Arel.sql("COUNT(*) DESC"))
        .limit(6)
        .count
        .map do |(tag_id, tag_name), count|
          {
            id: tag_id,
            name: tag_name,
            count: count
          }
        end
    end

    def total_minutes(logs)
      logs.sum do |log|
        if log.actual_minutes.present? && log.actual_minutes.positive?
          log.actual_minutes
        elsif log.start_time && log.end_time
          ((log.end_time - log.start_time) / 60.0).round
        else
          0
        end
      end
    end

    def record_attrs(args, keys)
      keys.each_with_object({}) do |key, attrs|
        attrs[key] = args[key] if args.key?(key) && !args[key].nil?
      end
    end

    def collection_payload(records)
      {
        count: records.length,
        records: records
      }
    end

    def ensure_write_allowed!
      raise ToolError, "This MCP token does not allow app writes." unless token.allows?("app:write")
      raise ToolError, "Demo accounts are read-only." if user.demo_account?
    end

    def ensure_project_write_allowed!
      ensure_write_allowed!
      return if user.owner? || user.project_manager?

      raise ToolError, "Project create/update requires owner or project_manager role."
    end

    def ensure_repo_write_allowed!
      ensure_repo_read_allowed!
      raise ToolError, "This MCP token does not allow repository writes." unless token.allows?("repo:write")
      ensure_code_tools_enabled!
    end

    def ensure_repo_read_allowed!
      raise ToolError, "This MCP token does not allow repository reads." unless token.allows?("repo:read")
    end

    def ensure_code_tools_enabled!
      raise ToolError, "Repository code tools are disabled. Set MCP_ENABLE_CODE_TOOLS=true locally to enable them." unless RepoTools.write_enabled?
    end

    def ensure_db_query_allowed!
      raise ToolError, "This MCP token does not allow database reads." unless token.allows?("db:read")
      unless ActiveModel::Type::Boolean.new.cast(ENV["MCP_ENABLE_DB_TOOLS"])
        raise ToolError, "Database MCP tools are disabled. Set MCP_ENABLE_DB_TOOLS=true locally to enable read-only SQL."
      end
    end

    def ensure_rails_runtime_allowed!
      raise ToolError, "This MCP token does not allow Rails runtime execution." unless token.allows?("system:admin")
      unless ActiveModel::Type::Boolean.new.cast(ENV["MCP_ENABLE_RAILS_RUNTIME_TOOLS"])
        raise ToolError, "Rails runtime MCP tools are disabled. Set MCP_ENABLE_RAILS_RUNTIME_TOOLS=true locally to enable them."
      end
    end

    def assert_workspace_record!(model, id)
      model.find(id)
    rescue ActiveRecord::RecordNotFound
      raise ToolError, "#{model.name} #{id} was not found in this workspace."
    end

    def assert_workspace_user!(id)
      user.workspace.users.find(id)
    rescue ActiveRecord::RecordNotFound
      raise ToolError, "User #{id} was not found in this workspace."
    end

    def required_id(args, key)
      value = args[key]
      raise ToolError, "#{key} is required" if value.blank?

      value.to_i
    end

    def required_string(args, key)
      value = args[key].to_s.strip
      raise ToolError, "#{key} is required" if value.blank?

      value
    end

    def required_decimal(args, key)
      value = args[key]
      raise ToolError, "#{key} is required" if value.blank?

      BigDecimal(value.to_s)
    rescue ArgumentError
      raise ToolError, "#{key} must be numeric"
    end

    def bounded_limit(value, default:, max:)
      limit = value.to_i
      limit = default if limit < 1
      [limit, max].min
    end

    def parse_date(value, default:)
      return default if value.blank?

      Date.parse(value.to_s)
    rescue ArgumentError
      raise ToolError, "Invalid date: #{value}"
    end

    def parse_time(value, default:)
      return default if value.blank?

      Time.zone.parse(value.to_s)
    rescue ArgumentError, TypeError
      raise ToolError, "Invalid datetime: #{value}"
    end

    def truthy?(value)
      ActiveModel::Type::Boolean.new.cast(value)
    end

    def validation_message(record)
      errors = record&.errors&.full_messages
      errors.present? ? errors.join(", ") : "Record is invalid"
    end
  end
end
