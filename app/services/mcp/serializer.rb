module Mcp
  class Serializer
    class << self
      def user(user)
        return unless user

        {
          id: user.id,
          name: user.full_name,
          email: user.email,
          job_title: user.job_title,
          status: user.status,
          availability_status: user.availability_status,
          availability_label: user.availability_label,
          department_id: user.department_id,
          department_name: user.department&.name,
          roles: user.role_names,
          last_seen_at: user.last_seen_at,
          current_projects_count: user.current_projects_count
        }
      end

      def project(project)
        {
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          start_date: project.start_date,
          end_date: project.end_date,
          qa_mode_enabled: project.qa_mode_enabled,
          sheet_integration_enabled: project.sheet_integration_enabled,
          issue_sheet_name: project.issue_sheet_name,
          owner: user(project.owner),
          member_count: project.project_users.size,
          task_count: project.tasks.size,
          open_task_count: project.tasks.where.not(status: completed_statuses).count,
          issue_count: project.issues.size,
          open_issue_count: project.issues.where.not(status: closed_issue_statuses).count,
          created_at: project.created_at,
          updated_at: project.updated_at
        }
      end

      def project_detail(project)
        self.project(project).merge(
          members: project.project_users.includes(user: :department).map { |project_user| project_user(project_user) },
          sprints: project.sprints.order(start_date: :desc).limit(30).map { |sprint| self.sprint(sprint) },
          recent_tasks: project.tasks.includes(:assigned_user, :developer, :sprint).order(updated_at: :desc).limit(30).map { |task| self.task(task) },
          recent_issues: project.issues.includes(:assignee_user, :reporter).order(updated_at: :desc).limit(30).map { |issue| self.issue(issue) },
          environments: project.project_environments.order(:name).map { |environment| project_environment(environment) },
          vault_items: project.project_vault_items.order(updated_at: :desc).limit(20).map { |item| project_vault_item(item) },
          upcoming_events_count: project.calendar_events.where("start_at >= ?", Time.current).count
        )
      end

      def project_user(project_user)
        {
          id: project_user.id,
          project_id: project_user.project_id,
          project_name: project_user.project&.name,
          role: project_user.role,
          status: project_user.status,
          allocation_percentage: project_user.allocation_percentage,
          workload_status: project_user.workload_status,
          user: user(project_user.user),
          created_at: project_user.created_at,
          updated_at: project_user.updated_at
        }
      end

      def project_environment(environment)
        {
          id: environment.id,
          project_id: environment.project_id,
          project_name: environment.project&.name,
          name: environment.name,
          url: environment.url,
          description: environment.description,
          vault_items_count: environment.project_vault_items.size,
          created_at: environment.created_at,
          updated_at: environment.updated_at
        }
      end

      def project_vault_item(item)
        {
          id: item.id,
          project_id: item.project_id,
          project_name: item.project&.name,
          title: item.title,
          category: item.category,
          environment_id: item.project_environment_id,
          environment_name: item.project_environment&.name,
          username_present: item.username.present?,
          content_present: item.content.present?,
          metadata_keys: item.metadata.to_h.keys,
          created_at: item.created_at,
          updated_at: item.updated_at
        }
      end

      def sprint(sprint)
        {
          id: sprint.id,
          project_id: sprint.project_id,
          project_name: sprint.project&.name,
          name: sprint.name,
          status: sprint.status,
          progress: sprint.progress,
          start_date: sprint.start_date,
          end_date: sprint.end_date,
          working_days_mask: sprint.working_days_mask,
          task_count: sprint.tasks.size,
          created_at: sprint.created_at,
          updated_at: sprint.updated_at
        }
      end

      def task(task)
        {
          id: task.id,
          task_id: task.task_id,
          task_url: task.task_url,
          title: task.title.presence || task.task_id,
          description: task.description,
          type: task.type,
          status: task.status,
          priority: task.priority,
          project_id: task.project_id,
          project_name: task.project&.name,
          sprint_id: task.sprint_id,
          sprint_name: task.sprint&.name,
          developer: user(task.developer),
          assigned_user: user(task.assigned_user),
          start_date: task.start_date,
          end_date: task.end_date,
          estimated_hours: decimal(task.estimated_hours),
          blocker: task.blocker,
          demo: task.demo,
          qa_assigned: task.qa_assigned,
          internal_qa: task.internal_qa,
          swag_point: decimal(task.swag_point),
          story_point: decimal(task.story_point),
          dev_hours: decimal(task.dev_hours),
          qa_hours: decimal(task.qa_hours),
          total_hours: decimal(task.total_hours),
          created_at: task.created_at,
          updated_at: task.updated_at
        }
      end

      def task_log(log)
        {
          id: log.id,
          task_id: log.task_id,
          task_title: log.task&.title || log.task&.task_id,
          developer: user(log.developer),
          log_date: log.log_date,
          hours_logged: decimal(log.hours_logged),
          type: log.type,
          status: log.status,
          created_at: log.created_at,
          updated_at: log.updated_at
        }
      end

      def issue(issue)
        {
          id: issue.id,
          project_id: issue.project_id,
          project_name: issue.project&.name,
          issue_key: issue.issue_key,
          title: issue.title,
          status: issue.status,
          severity: issue.severity,
          category: issue.category,
          module_name: issue.module_name,
          sub_module: issue.sub_module,
          issue_description: issue.issue_description,
          pre_conditions: issue.pre_conditions,
          repro_steps: issue.repro_steps,
          actual_result: issue.actual_result,
          expected_result: issue.expected_result,
          comment: issue.comment,
          assignee: issue.assignee,
          assignee_email: issue.assignee_email,
          assignee_user: user(issue.assignee_user),
          reporter: user(issue.reporter),
          due_date: issue.due_date,
          found_on: issue.found_on,
          media_count: issue.media_files.attachments.size,
          media_urls_count: issue.media_urls.size,
          attachment_urls_count: issue.attachment_urls.size,
          created_at: issue.created_at,
          updated_at: issue.updated_at
        }
      end

      def calendar_event(event)
        {
          id: event.id,
          title: event.title,
          description: event.description,
          start_at: event.start_at,
          end_at: event.end_at,
          all_day: event.all_day,
          event_type: event.event_type,
          visibility: event.visibility,
          status: event.status,
          location_or_meet_link: event.location_or_meet_link,
          user: user(event.user),
          project_id: event.project_id,
          project_name: event.project&.name,
          task_id: event.task_id,
          sprint_id: event.sprint_id,
          recurrence_rule: event.recurrence_rule,
          recurrence_until: event.recurrence_until,
          reminders: event.event_reminders.map do |reminder|
            {
              id: reminder.id,
              channel: reminder.channel,
              minutes_before: reminder.minutes_before,
              send_at: reminder.send_at,
              state: reminder.state,
              sent_at: reminder.sent_at
            }
          end,
          created_at: event.created_at,
          updated_at: event.updated_at
        }
      end

      def work_log(log)
        {
          id: log.id,
          user: user(log.user),
          title: log.title,
          description: log.description,
          log_date: log.log_date,
          start_time: time(log.start_time),
          end_time: time(log.end_time),
          actual_minutes: log.actual_minutes,
          category: log.category && {
            id: log.category.id,
            name: log.category.name,
            color: log.category.color,
            hex: log.category.hex
          },
          priority: log.priority && {
            id: log.priority.id,
            name: log.priority.name,
            color: log.priority.color,
            hex: log.priority.hex
          },
          tags: log.tags.map { |tag| { id: tag.id, name: tag.name } },
          created_at: log.created_at,
          updated_at: log.updated_at
        }
      end

      def work_note(note)
        {
          id: note.id,
          user: user(note.user),
          note_date: note.note_date,
          content: note.content,
          created_at: note.created_at,
          updated_at: note.updated_at
        }
      end

      def work_taxonomy(record)
        payload = {
          id: record.id,
          type: record.class.name.underscore,
          name: record.name,
          created_at: record.created_at,
          updated_at: record.updated_at
        }
        payload[:color] = record.color if record.respond_to?(:color)
        payload[:hex] = record.hex if record.respond_to?(:hex)
        payload
      end

      def department(department)
        {
          id: department.id,
          name: department.name,
          description: department.description,
          manager: user(department.manager),
          users_count: department.users.size,
          created_at: department.created_at,
          updated_at: department.updated_at
        }
      end

      def post(post, current_user:)
        {
          id: post.id,
          user: user(post.user),
          message: post.message,
          comments_count: post.comments_count,
          likes_count: post.post_likes.size,
          liked_by_current_user: post.post_likes.any? { |like| like.user_id == current_user.id },
          image_attached: post.image.attached?,
          recent_comments: post.comments.includes(:user).order(created_at: :desc).limit(5).map { |comment| self.comment(comment) },
          created_at: post.created_at,
          updated_at: post.updated_at
        }
      end

      def comment(comment)
        {
          id: comment.id,
          post_id: comment.post_id,
          user: user(comment.user),
          body: comment.body,
          created_at: comment.created_at,
          updated_at: comment.updated_at
        }
      end

      def team(team)
        {
          id: team.id,
          name: team.name,
          description: team.description,
          owner: user(team.owner),
          member_count: team.team_users.size,
          members: team.team_users.includes(user: :department).map do |team_user|
            {
              team_user_id: team_user.id,
              role: team_user.role,
              status: team_user.status,
              user: user(team_user.user)
            }
          end,
          learning_goals_count: team.learning_goals.size,
          created_at: team.created_at,
          updated_at: team.updated_at
        }
      end

      def skill(skill)
        user_skills = skill.user_skills.includes(:user)
        {
          id: skill.id,
          name: skill.name,
          category: skill.category,
          users_count: user_skills.size,
          users: user_skills.map do |user_skill|
            {
              user_skill_id: user_skill.id,
              proficiency: user_skill.proficiency,
              endorsements_count: user_skill.endorsements_count,
              last_endorsed_at: user_skill.last_endorsed_at,
              user: user(user_skill.user)
            }
          end,
          created_at: skill.created_at,
          updated_at: skill.updated_at
        }
      end

      def learning_goal(goal)
        {
          id: goal.id,
          title: goal.title,
          description: goal.description,
          due_date: goal.due_date,
          due_in_days: goal.due_in_days,
          progress: goal.progress,
          user: user(goal.user),
          team_id: goal.team_id,
          team_name: goal.team&.name,
          checkpoints: goal.learning_checkpoints.order(:created_at).map do |checkpoint|
            {
              id: checkpoint.id,
              title: checkpoint.title,
              completed: checkpoint.completed,
              resource_url: checkpoint.resource_url,
              updated_at: checkpoint.updated_at
            }
          end,
          created_at: goal.created_at,
          updated_at: goal.updated_at
        }
      end

      def knowledge_bookmark(bookmark)
        payload = bookmark.payload.to_h
        {
          id: bookmark.id,
          card_type: bookmark.card_type,
          collection_name: bookmark.collection_name,
          source_id: bookmark.source_id,
          title: payload["title"] || payload["question"] || payload["term"] || payload["headline"],
          summary: payload["summary"] || payload["answer"] || payload["definition"],
          url: payload["url"],
          payload: payload.except("secret", "token", "password", "api_key"),
          last_viewed_at: bookmark.last_viewed_at,
          last_reminded_at: bookmark.last_reminded_at,
          next_reminder_at: bookmark.next_reminder_at,
          reminder_interval_days: bookmark.reminder_interval_days,
          created_at: bookmark.created_at,
          updated_at: bookmark.updated_at
        }
      end

      def knowledge_prompt_run(run)
        {
          id: run.id,
          prompt: run.prompt,
          source: run.source,
          generation_mode: run.generation_mode,
          status: run.status,
          metadata: run.metadata.to_h.except("secret", "token", "password", "api_key"),
          item_count: run.knowledge_items.size,
          created_at: run.created_at,
          updated_at: run.updated_at
        }
      end

      def knowledge_item(item)
        {
          id: item.id,
          title: item.title,
          summary: item.summary,
          body: item.body,
          category: item.category,
          item_type: item.item_type,
          collection_name: item.collection_name,
          source_name: item.source_name,
          source_url: item.source_url,
          source_key: item.source_key,
          published_at: item.published_at,
          tags: Array(item.tags),
          payload: item.payload.to_h.except("secret", "token", "password", "api_key"),
          active: item.active,
          archived_at: item.archived_at,
          replaced_by_id: item.replaced_by_id,
          position: item.position,
          prompt_run_id: item.knowledge_prompt_run_id,
          prompt: item.knowledge_prompt_run&.prompt,
          generation_mode: item.knowledge_prompt_run&.generation_mode,
          created_at: item.created_at,
          updated_at: item.updated_at
        }
      end

      def conversation(conversation, current_user:)
        latest_message = conversation.messages.order(created_at: :desc).first
        membership = conversation.conversation_participants.find { |cp| cp.user_id == current_user.id } ||
          conversation.conversation_participants.find_by(user_id: current_user.id)

        {
          id: conversation.id,
          title: conversation.display_name(current_user),
          conversation_type: conversation.conversation_type,
          participants: conversation.participants.map { |participant| user(participant) },
          unread_count: conversation.messages
            .where("messages.id > ?", membership&.last_read_message_id || 0)
            .where.not(user_id: current_user.id)
            .count,
          latest_message: latest_message && {
            id: latest_message.id,
            body: latest_message.body.to_s.truncate(500),
            user: user(latest_message.user),
            created_at: latest_message.created_at,
            attachment_count: latest_message.attachments.attachments.size
          },
          updated_at: conversation.updated_at
        }
      end

      def notification(notification)
        {
          id: notification.id,
          action: notification.action,
          actor: user(notification.actor),
          notifiable_type: notification.notifiable_type,
          notifiable_id: notification.notifiable_id,
          metadata: notification.metadata,
          read_at: notification.read_at,
          created_at: notification.created_at,
          updated_at: notification.updated_at
        }
      end

      def pdf_document(document)
        current_version = document.current_version
        {
          id: document.id,
          title: document.title,
          original_filename: document.original_filename,
          page_count: document.page_count,
          encrypted: document.encrypted,
          storage_bytes: document.storage_bytes,
          current_version: current_version && {
            id: current_version.id,
            version_number: current_version.version_number,
            operation: current_version.operation,
            page_count: current_version.page_count,
            encrypted: current_version.encrypted,
            byte_size: current_version.byte_size,
            metadata: current_version.metadata,
            created_at: current_version.created_at
          },
          versions_count: document.versions.size,
          operations: document.operations.order(created_at: :desc).limit(10).map do |operation|
            {
              id: operation.id,
              kind: operation.kind,
              status: operation.status,
              progress: operation.progress,
              error_message: operation.error_message,
              started_at: operation.started_at,
              completed_at: operation.completed_at,
              created_at: operation.created_at
            }
          end,
          created_at: document.created_at,
          updated_at: document.updated_at
        }
      end

      def pdf_operation(operation)
        {
          id: operation.id,
          pdf_document_id: operation.pdf_document_id,
          document_title: operation.pdf_document&.title,
          kind: operation.kind,
          status: operation.status,
          progress: operation.progress,
          parameters: operation.parameters.to_h.except("password"),
          result: operation.result,
          error_message: operation.error_message,
          artifacts_count: operation.artifacts.size,
          started_at: operation.started_at,
          completed_at: operation.completed_at,
          created_at: operation.created_at,
          updated_at: operation.updated_at
        }
      end

      def portfolio_profile(profile)
        return unless profile

        profile.as_json(
          only: %i[full_name headline location summary skills metrics social_links architecture engineering_highlights]
        )
      end

      def portfolio_project(project)
        project.as_json(
          only: %i[id title slug tagline summary description stack metrics engineering_highlights case_study seo repository_url live_url featured published position]
        ).merge(
          features: project.portfolio_features.select(&:published?).sort_by { |feature| [feature.position, feature.id] }.map do |feature|
            feature.as_json(only: %i[id category title summary demo_path alt_text position tour_position review_notes])
          end
        )
      end

      def mcp_audit_log(log)
        {
          id: log.id,
          tool_name: log.tool_name,
          action: log.action,
          metadata: log.metadata,
          user: user(log.user),
          created_at: log.created_at
        }
      end

      def route(route)
        {
          verb: route.verb,
          path: route.path.spec.to_s.gsub("(.:format)", ""),
          controller: route.defaults[:controller],
          action: route.defaults[:action],
          name: route.name
        }
      end

      def completed_statuses
        %w[done completed complete archived cancelled]
      end

      def closed_issue_statuses
        ["Resolved", "Not Reproducible", "Not an issue"]
      end

      private

      def decimal(value)
        value&.to_f
      end

      def time(value)
        value&.strftime("%H:%M")
      end
    end
  end
end
