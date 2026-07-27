class DemoWorkspaceSeeder
  DEMO_EMAIL = "guest@nexushub.demo".freeze

  def call
    workspace = Workspace.find_or_initialize_by(slug: "nexus-hub-demo")
    workspace.update!(name: "Nexus Hub Demo", kind: "demo")

    previous_workspace = Current.workspace
    previous_user = Current.user
    previous_suppress_realtime_broadcasts = Current.suppress_realtime_broadcasts
    Current.workspace = workspace
    Current.suppress_realtime_broadcasts = true

    roles = Role::NAMES.index_with { |name| Role.find_or_create_by!(name: name) }
    guest = upsert_user(workspace, email: DEMO_EMAIL, first_name: "Demo", last_name: "Visitor", job_title: "Portfolio Guest", demo_account: true, landing_page: "demo")
    guest.roles = [roles.fetch("member")]
    Current.user = guest
    engineer = upsert_user(workspace, email: "alex@nexushub.demo", first_name: "Demo", last_name: "Engineer", job_title: "Full-stack Engineer")
    qa_user = upsert_user(workspace, email: "maya@nexushub.demo", first_name: "Demo", last_name: "QA", job_title: "QA Engineer")

    department = Department.find_or_initialize_by(name: "Product Engineering")
    department.update!(manager: engineer, description: "Synthetic team data for the public portfolio demo.")
    [guest, engineer, qa_user].each { |user| user.update!(department: department) }

    team = Team.find_or_initialize_by(name: "Nexus Product Team")
    team.update!(description: "A cross-functional team shipping the Nexus Hub demo.", owner: engineer)
    [[guest, "viewer"], [engineer, "admin"], [qa_user, "member"]].each do |user, role|
      TeamUser.find_or_initialize_by(team: team, user: user).update!(role: role, status: "accepted")
    end

    project = Project.find_or_initialize_by(name: "Nexus Hub Showcase")
    project.update!(
      description: "A synthetic project demonstrating the complete delivery workflow.",
      owner: engineer,
      start_date: Date.current - 30.days,
      end_date: Date.current + 45.days,
      sheet_integration_enabled: false,
      qa_mode_enabled: true
    )
    [[guest, "viewer"], [engineer, "manager"], [qa_user, "qa"]].each do |user, role|
      ProjectUser.find_or_initialize_by(project: project, user: user).update!(
        role: role,
        status: "active",
        allocation_percentage: role == "viewer" ? 0 : 75,
        workload_status: "partial"
      )
    end

    sprint = Sprint.find_or_initialize_by(project: project, name: "Portfolio Demo Sprint")
    sprint.update!(start_date: Date.current - 5.days, end_date: Date.current + 9.days, status: "in_progress", progress: 58, created_by: engineer.id, updated_by: engineer.id)

    task_specs = [
      ["NX-101", "Build workspace dashboard", "completed", 1, 8],
      ["NX-102", "Add guided demo tour", "in_progress", 2, 6],
      ["NX-103", "Harden tenant authorization", "in_progress", 3, 10],
      ["NX-104", "Polish mobile navigation", "todo", 4, 5],
      ["NX-105", "Verify PDF export workflow", "todo", 5, 4]
    ]
    tasks = task_specs.map do |task_id, title, status, order, hours|
      task = Task.find_or_initialize_by(project: project, task_id: task_id)
      task.update!(
        sprint: sprint,
        developer: engineer,
        assigned_user: engineer,
        type: "Code",
        title: title,
        status: status,
        order: order,
        estimated_hours: hours,
        start_date: Date.current - 3.days,
        end_date: Date.current + order.days,
        priority: order < 3 ? "High" : "Medium",
        created_by: engineer.id,
        updated_by: engineer.id
      )
      task
    end
    TaskLog.find_or_initialize_by(task: tasks.first, developer: engineer, log_date: Date.current - 2.days, type: "Code").update!(
      hours_logged: 6,
      status: "completed",
      created_by: engineer.id,
      updated_by: engineer.id
    )

    Issue.find_or_initialize_by(issue_key: "DEMO-101").update!(
      project: project,
      reporter: qa_user,
      assignee_user: engineer,
      title: "Calendar reminder should preserve the selected timezone",
      status: "In Progress",
      severity: "High",
      category: "Functional",
      module_name: "Calendar",
      found_by: qa_user.full_name,
      found_on: Date.current - 2.days,
      issue_description: "Synthetic issue showing the complete QA workflow.",
      repro_steps: "Create an event, add a reminder, and change the browser timezone.",
      actual_result: "The reminder preview changes unexpectedly.",
      expected_result: "The reminder should remain aligned with the event timezone."
    )

    environment = ProjectEnvironment.find_or_initialize_by(project: project, name: "Demo")
    environment.update!(url: "https://example.test", description: "Non-production synthetic environment.")
    ProjectVaultItem.find_or_initialize_by(project: project, title: "Demo release checklist").update!(
      project_environment: environment,
      category: "Note",
      content: "Verify navigation, demo data, accessibility, and read-only protection."
    )

    post = Post.find_or_initialize_by(user: engineer, message: "The guided portfolio demo is ready for review.")
    post.save!
    Comment.find_or_create_by!(post: post, user: qa_user, body: "QA pass is in progress using synthetic data.")

    conversation = Conversation.find_or_initialize_by(title: "Demo Launch", conversation_type: "group")
    conversation.creator = engineer
    conversation.save!
    [guest, engineer, qa_user].each { |user| ConversationParticipant.find_or_create_by!(conversation: conversation, user: user) }
    Message.find_or_create_by!(conversation: conversation, user: engineer, body: "Welcome to the read-only Nexus Hub product tour.")
    Message.find_or_create_by!(conversation: conversation, user: qa_user, body: "All records here are synthetic and safe to explore.")

    event = CalendarEvent.find_or_initialize_by(user: guest, title: "Nexus Hub guided tour")
    event.update!(
      project: project,
      description: "Explore the flagship project in about five minutes.",
      start_at: Time.zone.now.beginning_of_hour + 1.day,
      end_at: Time.zone.now.beginning_of_hour + 1.day + 45.minutes,
      event_type: "meeting",
      visibility: "project",
      status: "scheduled",
      recurrence_rule: "none"
    )

    category = WorkCategory.find_or_create_by!(name: "Engineering") { |record| record.color = "blue" }
    priority = WorkPriority.find_or_create_by!(name: "High") { |record| record.color = "red" }
    tag = WorkTag.find_or_create_by!(name: "Portfolio")
    work_log = WorkLog.find_or_initialize_by(user: guest, log_date: Date.current, title: "Explore Nexus Hub")
    work_log.update!(
      description: "Review project delivery, collaboration, knowledge, and PDF workflows.",
      start_time: "09:30",
      end_time: "10:15",
      category: category,
      priority: priority,
      actual_minutes: 45,
      created_by: guest.id,
      updated_by: guest.id
    )
    work_log.tags = [tag]
    WorkNote.find_or_create_by!(user: guest, note_date: Date.current) { |note| note.content = "Start with the guided demo hub, then open the project dashboard." }

    skill = Skill.find_or_create_by!(name: "Ruby On Rails") { |record| record.category = "Backend" }
    UserSkill.find_or_initialize_by(user: engineer, skill: skill).update!(proficiency: "expert")

    goal = LearningGoal.find_or_initialize_by(user: guest, title: "Review the Nexus Hub architecture")
    goal.update!(
      team: team,
      description: "Understand how Rails, React, PostgreSQL, jobs, and realtime features work together.",
      due_date: Date.current + 7.days,
      progress: 50
    )
    LearningCheckpoint.find_or_create_by!(learning_goal: goal, title: "Open the project delivery dashboard") do |checkpoint|
      checkpoint.completed = true
      checkpoint.resource_url = "/projects/#{project.id}/dashboard"
    end
    LearningCheckpoint.find_or_create_by!(learning_goal: goal, title: "Review collaboration and chat") do |checkpoint|
      checkpoint.resource_url = "/chat"
    end

    KnowledgeBookmark.find_or_create_by!(user: guest, card_type: "coding_tip", source_id: "demo-architecture") do |bookmark|
      bookmark.collection_name = "Portfolio Tour"
      bookmark.payload = { title: "Workspace tenancy", summary: "Every business record is scoped to the authenticated workspace." }
      bookmark.reminder_interval_days = 7
    end
    Notification.find_or_create_by!(recipient: guest, actor: engineer, action: "update", notifiable: project) do |notification|
      notification.metadata = { message: "The guided demo workspace is ready." }
    end

    workspace
  ensure
    Current.suppress_realtime_broadcasts = previous_suppress_realtime_broadcasts
    Current.user = previous_user
    Current.workspace = previous_workspace
  end

  private

  def upsert_user(workspace, attributes)
    user = workspace.users.find_or_initialize_by(email: attributes.fetch(:email))
    user.assign_attributes(
      first_name: attributes.fetch(:first_name),
      last_name: attributes.fetch(:last_name),
      job_title: attributes.fetch(:job_title),
      status: "active",
      landing_page: attributes.fetch(:landing_page, "posts"),
      demo_account: attributes.fetch(:demo_account, false),
      avatar_color: User.generate_avatar_color(attributes.fetch(:email))
    )
    if user.new_record?
      generated_password = SecureRandom.base64(36)
      user.password = generated_password
      user.password_confirmation = generated_password
    end
    user.skip_confirmation!
    user.save!
    user
  end
end
