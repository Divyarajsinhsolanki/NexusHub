class Api::V1::BaseController < Api::BaseController
  # Native clients can send `Origin: null`, which Rails rejects before the
  # null-session forgery strategy runs. V1 uses Bearer tokens, not cookies.
  skip_forgery_protection

  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActionController::ParameterMissing, with: :render_invalid_request

  private

  def authentication_user
    bearer_token_user
  end

  def render_data(data, meta: nil, status: :ok)
    payload = { data: data }
    payload[:meta] = meta if meta
    render json: payload, status: status
  end

  def render_error(code:, message:, status:, details: nil)
    error = { code: code, message: message }
    error[:details] = details if details.present?
    render json: { error: error }, status: status
  end

  def render_validation_error(record)
    render_error(
      code: "validation_failed",
      message: "The submitted data is invalid.",
      details: record.errors.full_messages,
      status: :unprocessable_entity
    )
  end

  def render_paginated_data(scope, serializer:, per_page: 25, extra_meta: {})
    page = [params[:page].to_i, 1].max
    requested_per_page = params[:per_page].presence&.to_i || per_page
    requested_per_page = requested_per_page.clamp(1, 100)
    paginated = scope.page(page).per(requested_per_page)

    render_data(
      paginated.map { |record| serializer.call(record) },
      meta: {
        current_page: paginated.current_page,
        next_page: paginated.next_page,
        total_pages: paginated.total_pages,
        total_count: paginated.total_count,
        per_page: paginated.limit_value
      }.merge(extra_meta)
    )
  end

  def serialize_user(user)
    {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      full_name: user.full_name,
      job_title: user.job_title,
      bio: user.bio,
      avatar_color: user.avatar_color,
      color_theme: user.color_theme,
      dark_mode: user.dark_mode,
      profile_picture: attached_url(user.profile_picture),
      roles: user.role_names.sort,
      workspace: {
        id: user.workspace_id,
        name: user.workspace.name,
        slug: user.workspace.slug
      },
      preferences: {
        color_theme: user.color_theme,
        dark_mode: user.dark_mode,
        landing_page: user.landing_page,
        notification_preferences: user.notification_preferences_with_defaults
      },
      permissions: mobile_permissions(user),
      features: mobile_features(user),
      impersonation: {
        active: current_mobile_session&.impersonating? || false,
        owner: serialize_person(authenticated_mobile_user)
      }
    }
  end

  def serialize_project(project)
    {
      id: project.id,
      name: project.name,
      description: project.description,
      start_date: project.start_date,
      end_date: project.end_date,
      status: project.status,
      sprint_count: association_count(project, :sprints),
      task_count: association_count(project, :tasks)
    }
  end

  def serialize_sprint(sprint)
    {
      id: sprint.id,
      project_id: sprint.project_id,
      name: sprint.name,
      start_date: sprint.start_date,
      end_date: sprint.end_date,
      status: sprint.status,
      progress: sprint.progress,
      task_count: association_count(sprint, :tasks)
    }
  end

  def serialize_task(task)
    {
      id: task.id,
      task_id: task.task_id,
      title: task.title.presence || "Task #{task.task_id}",
      description: task.description,
      type: task.type,
      status: task.status,
      priority: task.priority,
      start_date: task.start_date,
      end_date: task.end_date,
      estimated_hours: task.estimated_hours,
      project_id: task.project_id,
      sprint_id: task.sprint_id,
      assignee: serialize_person(task.assigned_user || task.developer)
    }
  end

  def serialize_work_log(work_log)
    {
      id: work_log.id,
      title: work_log.title,
      description: work_log.description,
      log_date: work_log.log_date,
      start_time: work_log.start_time&.strftime("%H:%M"),
      end_time: work_log.end_time&.strftime("%H:%M"),
      actual_minutes: work_log.actual_minutes,
      category: serialize_work_option(work_log.category),
      priority: serialize_work_option(work_log.priority),
      tags: work_log.tags.map { |tag| { id: tag.id, name: tag.name } }
    }
  end

  def serialize_notification(notification)
    {
      id: notification.id,
      action: notification.action,
      message: notification_message(notification),
      actor: serialize_person(notification.actor),
      read_at: notification.read_at,
      created_at: notification.created_at,
      notifiable_type: notification.notifiable_type,
      notifiable_id: notification.notifiable_id,
      deep_link: notification_deep_link(notification)
    }
  end

  def serialize_person(user)
    return unless user

    {
      id: user.id,
      name: user.full_name,
      avatar_color: user.avatar_color,
      profile_picture: attached_url(user.profile_picture)
    }
  end

  def serialize_work_option(option)
    return unless option

    {
      id: option.id,
      name: option.name,
      color: option.try(:hex).presence || option.try(:color)
    }
  end

  def attached_url(attachment)
    return unless attachment.attached?

    rails_blob_url(attachment, host: request.base_url)
  end

  def association_count(record, name)
    association = record.association(name)
    association.loaded? ? association.target.size : association.count
  end

  def mobile_permissions(user)
    permissions = %w[
      activity.read calendar.manage posts.manage work.manage knowledge.read chat.manage
      profile.manage notifications.manage vault.manage pdf.manage
    ]
    permissions.concat(%w[projects.manage project_members.manage]) if user.owner? || user.project_manager?
    permissions.concat(%w[teams.manage]) if user.owner? || user.team_leader?
    permissions.concat(%w[users.create departments.manage]) if user.owner? || user.admin?
    permissions.concat(%w[users.manage impersonation.manage]) if user.owner?
    permissions.concat(%w[admin.manage]) if user.owner? || user.admin? || user.site_admin?
    permissions << "portfolio.manage" if user.site_admin?
    permissions.uniq.sort
  end

  def mobile_features(user)
    features = Api::V1::MobileConfigController::FEATURES.index_with { true }
    features["admin"] = user.owner? || user.admin? || user.site_admin?
    features["portfolio_admin"] = user.site_admin?
    features
  end

  def notification_message(notification)
    actor = notification.actor.full_name
    case notification.action
    when "assigned" then "#{actor} assigned you a task"
    when "commented" then "#{actor} commented on your post"
    when "update" then "#{actor} updated a task"
    when "calendar_reminder" then "Reminder: #{notification.metadata&.dig('event_title') || 'an event'} is coming up"
    when "chat_message" then "#{actor} sent a message"
    when "chat_ping" then "#{actor} mentioned you"
    when "missed_call" then "Missed call from #{actor}"
    when "reacted" then "#{actor} reacted to your message"
    else "New notification"
    end
  end

  def notification_deep_link(notification)
    notifiable = notification.notifiable
    task = notifiable if notifiable.is_a?(Task)
    project = notifiable if notifiable.is_a?(Project)
    project ||= task&.project

    return "/projects/#{project.id}?taskId=#{task.id}" if project && task
    return "/projects/#{project.id}" if project

    "/notifications"
  rescue ActiveRecord::RecordNotFound
    "/notifications"
  end

  def handle_unauthorized
    render_error(code: "unauthorized", message: "Authentication is required.", status: :unauthorized)
  end

  def enforce_demo_read_only!
    return unless current_user&.demo_account?
    return if request.get? || request.head?
    return if controller_name == "auth" && action_name == "logout"

    render_error(code: "demo_read_only", message: "The demo workspace is read-only.", status: :forbidden)
  end

  def render_not_found
    render_error(code: "not_found", message: "The requested resource was not found.", status: :not_found)
  end

  def render_invalid_request(error)
    render_error(code: "invalid_request", message: error.message, status: :unprocessable_entity)
  end
end
