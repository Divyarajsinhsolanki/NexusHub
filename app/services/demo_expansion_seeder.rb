class DemoExpansionSeeder
  def call(project:, users:)
    guest, engineer, reviewer, designer, operator = users
    users.each_with_index do |user, index|
      unless user.profile_picture.attached?
        path = Rails.root.join("app/assets/images/demo/avatar-#{index + 1}.png")
        File.open(path, "rb") { |io| user.profile_picture.attach(io: io, filename: path.basename.to_s, content_type: "image/png") }
      end
    end
    users.each do |user|
      ["Team Communication", "Delivery Planning", "Demo Product Navigation"].each do |name|
        skill = Skill.find_or_create_by!(name: name) { |record| record.category = "Collaboration" }
        UserSkill.find_or_create_by!(user: user, skill: skill) { |record| record.proficiency = "intermediate" }
      end
    end
    PersonalVaultSeeder.new.call(user: guest)
    projects = [project]
    [["Mobile Companion", designer], ["Knowledge Studio", operator]].each do |name, owner|
      extra = Project.find_or_create_by!(name: name) do |record|
        record.assign_attributes(owner: owner, description: "Synthetic #{name.downcase} project for the guided demo.",
          start_date: Date.current - 20.days, end_date: Date.current + 40.days, qa_mode_enabled: true, sheet_integration_enabled: false)
      end
      users.each do |user|
        ProjectUser.find_or_initialize_by(project: extra, user: user).update!(role: user == guest ? "viewer" : user == reviewer ? "qa" : "manager",
          status: "active", allocation_percentage: user == guest ? 0 : 25, workload_status: "partial")
      end
      DemoOperationsSeeder.new.call(project: extra, owner: owner, reviewer: reviewer)
      projects << extra
    end
    projects.each_with_index do |record, index|
      seed_delivery(record, users, index)
      seed_extra_inventory(record, engineer)
    end
    seed_daily(guest, projects)
    seed_chat(users)
    seed_knowledge(guest)
    seed_knowledge_topics(guest)
    seed_documents(guest)
    LearningGoal.where(user: guest).find_each do |goal|
      LearningCheckpoint.find_or_create_by!(learning_goal: goal, title: "Write a short review of #{goal.title.downcase}")
      goal.recalculate_progress!
    end
  end

  private

  def seed_delivery(project, users, project_index)
    guest, engineer, reviewer = users
    3.times do |index|
      sprint = Sprint.find_or_create_by!(project: project, name: "Demo delivery cycle #{index + 1}") do |record|
        record.assign_attributes(start_date: Date.current + (index - 1) * 14, end_date: Date.current + (index - 1) * 14 + 13,
          status: %w[completed in_progress planned][index], progress: [100, 50, 0][index], created_by: engineer.id, updated_by: engineer.id)
      end
      3.times do |task_index|
        task = Task.find_or_create_by!(project: project, task_id: "DEMO-P#{project_index + 1}-S#{index + 1}-T#{task_index + 1}") do |record|
          record.assign_attributes(sprint: sprint, developer: engineer, assigned_user: task_index == 2 ? guest : engineer,
            type: "Code", title: ["Build #{project.name} interface", "Review #{project.name} accessibility", "Document #{project.name} handoff"][task_index],
            status: %w[completed in_progress todo][task_index], priority: %w[High Medium Low][task_index], estimated_hours: task_index + 2,
            start_date: sprint.start_date, end_date: sprint.end_date, created_by: engineer.id, updated_by: engineer.id)
        end
        TaskLog.find_or_create_by!(task: task, developer: engineer, type: "Code", log_date: Date.current - task_index) do |record|
          record.assign_attributes(hours_logged: task_index + 1, status: task.status, created_by: engineer.id, updated_by: engineer.id)
        end
      end
      Issue.find_or_create_by!(issue_key: "DEMO-P#{project_index + 1}-QA#{index + 1}") do |record|
        record.assign_attributes(project: project, reporter: reviewer, assignee_user: engineer,
          title: ["Small-screen layout needs review", "Empty-state labels need clarification", "Keyboard focus needs a visible outline"][index],
          status: "New", severity: %w[High Medium Low][index], category: "Functional", module_name: project.name,
          found_by: reviewer.full_name, found_on: Date.current, issue_description: "Synthetic QA example for #{project.name}.")
      end
    end
    # Three entries per Vault category in each project, without copying private data.
    ProjectVaultItem::CATEGORIES.each do |category|
      3.times do |index|
        title = "Demo #{category.downcase} example #{index + 1}"
        content = case category
        when "Media" then ShowcaseMedia.url("0#{index + 1}-#{%w[project-delivery planning-focus collaboration][index]}.webp")
        when "Credential", "Token" then "demo-only-placeholder-#{index + 1}-no-real-access"
        when "Command" then ["bin/dev", "bin/rails db:prepare", "npm test"][index]
        else "Synthetic #{category.downcase} example #{index + 1} for #{project.name}. Review ownership, environment and release notes."
        end
        item = ProjectVaultItem.find_or_create_by!(project: project, title: title) do |record|
          record.assign_attributes(category: category, content: content, project_environment: project.project_environments.order(:id)[index])
        end
        item.update!(content: content) if category == "Media" && item.content.start_with?("/portfolio-seed-images/") && item.content != content
      end
    end
  end

  def seed_extra_inventory(project, owner)
    environments = project.project_environments.order(:id).to_a
    service = ProjectOperationItem.find_by(project: project, kind: "service", name: "Demo asset delivery")
    unless service
      result = Operations::Mutation.new(project: project, actor: owner, revision: project.reload.operations_revision).call(action: :create,
        attributes: { kind: "service", name: "Demo asset delivery", details: { purpose: "Synthetic media delivery inventory", owner_id: owner.id },
          entries: environments.map { |environment| { environment_id: environment.id, details: { endpoints: [{ label: "Assets", url: "https://assets.#{environment.name.downcase}.example.test" }] } } } })
      service = ProjectOperationItem.find(result.fetch(:item).fetch(:id))
    end
    unless ProjectOperationItem.exists?(project: project, kind: "software", name: "Demo asset pipeline")
    Operations::Mutation.new(project: project, actor: owner, revision: project.reload.operations_revision).call(action: :create,
      attributes: { kind: "software", name: "Demo asset pipeline", details: { service_id: service.id, ecosystem: "Application" },
        entries: environments.map { |environment| { environment_id: environment.id, expected_version: "3.0.0", observed_version: "3.0.0",
          observed_at: Time.current.iso8601, source: "synthetic_seed", verify_observation: true } } })
    end
    software = ProjectOperationItem.find_by!(project: project, name: "Demo asset pipeline", kind: "software")
    ["Monthly asset release review", "Weekly recovery review"].each_with_index do |name, index|
      next if ProjectDeploymentSeries.exists?(project: project, name: name)
      series = ProjectDeploymentSeries.create!(project: project, project_environment: environments[index], owner: owner,
        name: name, recipient_ids: [], reminder_minutes: [], time_zone: "Asia/Kolkata", frequency: index.zero? ? "monthly" : "weekly",
        weekdays: [Date.current.wday], day_of_month: Date.current.day, local_time: "10:00", starts_on: Date.current + 7.days,
        ends_on: Date.current + 60.days, targets: [{ "item_id" => software.id, "expected_version" => "3.0.0" }],
        notes: "Synthetic recurring review; no reminder delivery or infrastructure execution.")
      Operations::Schedules.materialize!(series)
    end
  end

  def seed_daily(guest, projects)
    3.times do |index|
      category = WorkCategory.find_or_create_by!(name: %w[Design Quality Operations][index]) { |record| record.color = %w[purple green blue][index] }
      priority = WorkPriority.find_or_create_by!(name: %w[Medium Low Normal][index]) { |record| record.color = %w[yellow green blue][index] }
      tag = WorkTag.find_or_create_by!(name: %w[Review Learning Release][index])
      log = WorkLog.find_or_create_by!(user: guest, title: "Demo focus: #{projects[index].name}", log_date: Date.current - index) do |record|
        record.assign_attributes(description: "Synthetic delivery review and learning session.", start_time: "11:00", end_time: "11:45",
          actual_minutes: 45, category: category, priority: priority, created_by: guest.id, updated_by: guest.id)
      end
      log.tags = [tag] unless log.tags.exists?(id: tag.id)
      WorkNote.find_or_create_by!(user: guest, note_date: Date.current - index - 1) { |record| record.content = "Demo review #{index + 1}: capture the next action and one lesson learned." }
      event = CalendarEvent.find_or_initialize_by(user: guest, title: "Demo #{%w[design quality release][index]} review")
      event.update!(project: projects[index], start_at: (Time.current + index.days).beginning_of_hour + 2.hours,
        end_at: (Time.current + index.days).beginning_of_hour + 3.hours, visibility: "project", event_type: %w[meeting focus sprint_ceremony][index],
        status: "scheduled", description: "Synthetic review session; no reminders are scheduled.")
      Task.find_or_create_by!(assigned_user: guest, type: "general", title: "Demo personal priority #{index + 1}") do |record|
        record.assign_attributes(status: %w[todo in_progress completed][index], priority: "Medium", start_date: Date.current, end_date: Date.current + 2.days)
      end
    end
  end

  def seed_chat(users)
    guest, engineer, reviewer, designer, operator = users
    ["Design Review", "QA Handoff", "Platform Rehearsal"].each_with_index do |title, index|
      conversation = Conversation.find_or_create_by!(title: title, conversation_type: "group") { |record| record.creator = users[index + 1] }
      users.each { |user| ConversationParticipant.find_or_create_by!(conversation: conversation, user: user) }
      ["Welcome to the synthetic #{title.downcase} discussion.", "The project examples and checklists are ready to explore.", "Let's record observations before our next demo review."].each_with_index do |body, message_index|
        Message.find_or_create_by!(conversation: conversation, user: users[message_index + 1], body: body)
      end
    end
    [engineer, reviewer, designer].each do |other|
      conversation = Conversation.find_or_create_by!(creator: guest, conversation_type: "direct", title: "Demo direct chat: #{other.last_name}")
      [guest, other].each { |user| ConversationParticipant.find_or_create_by!(conversation: conversation, user: user) }
      ["Hello! This is our synthetic demo conversation.", "The project examples are ready for review.", "Thanks, I will check the personal Vault and delivery checklist."].each_with_index do |body, index|
        Message.find_or_create_by!(conversation: conversation, user: index == 1 ? other : guest, body: body)
      end
    end
    original = Conversation.find_by!(title: "Demo Launch", conversation_type: "group")
    Message.find_or_create_by!(conversation: original, user: engineer, body: "Start with Projects, then explore your personal Vault and team learning goals.")
  end

  def seed_knowledge(guest)
    run = KnowledgePromptRun.find_or_create_by!(user: guest, prompt: "Synthetic demo learning collection", source: "demo_seed") do |record|
      record.assign_attributes(generation_mode: "history", status: "completed")
    end
    ["Workspace authorization", "Accessible interface reviews", "Release observations", "Database indexing", "Reliable background jobs", "Focused learning habits"].each_with_index do |title, index|
      KnowledgeItem.find_or_create_by!(user: guest, source_key: "demo-learning-#{index}") do |record|
        record.assign_attributes(knowledge_prompt_run: run, title: title, category: "learning", item_type: "note", position: index,
          summary: "A synthetic learning note about #{title.downcase}.", body: "Explore the matching demo workflow, record what you observe, and review the team checklist.",
          collection_name: "Demo Learning", tags: ["demo", "learning"])
      end
      KnowledgeBookmark.find_or_create_by!(user: guest, card_type: "coding_tip", source_id: "demo-tip-#{index}") do |record|
        record.assign_attributes(collection_name: "Portfolio Tour", payload: { title: title, summary: "Synthetic guidance for the guided tour." }, reminder_interval_days: 7)
      end
    end
  end

  def seed_knowledge_topics(guest)
    %w[news tech stocks].each do |category|
      run = KnowledgePromptRun.find_or_create_by!(user: guest, prompt: "Synthetic #{category} collection", source: "demo_seed") do |record|
        record.assign_attributes(generation_mode: "history", status: "completed")
      end
      3.times do |index|
        KnowledgeItem.find_or_create_by!(user: guest, source_key: "demo-#{category}-#{index}") do |record|
          record.assign_attributes(knowledge_prompt_run: run, title: "Demo #{category} example #{index + 1}", category: category,
            item_type: "note", position: index, summary: "Synthetic example for the #{category} topic; not live news or market data.",
            body: "Practice organizing a source, recording a summary, and reviewing it later.", tags: ["demo"], collection_name: "Demo Topics")
        end
        KnowledgeItem.find_or_create_by!(user: guest, source_key: "demo-archived-#{category}") do |record|
          record.assign_attributes(knowledge_prompt_run: run, title: "Archived demo #{category} note", category: category, item_type: "note",
            active: false, archived_at: Time.current, summary: "Synthetic historical note for the archive view.")
        end
      end
    end
    3.times do |index|
      KnowledgeBookmark.find_or_create_by!(user: guest, card_type: "coding_tip", source_id: "demo-review-due-#{index}") do |record|
        record.assign_attributes(collection_name: "Demo Reviews", payload: { title: "Demo review due #{index + 1}", summary: "Review a saved lesson from the guided tour." },
          reminder_interval_days: 7, last_viewed_at: 8.days.ago, next_reminder_at: 1.day.ago)
      end
    end
  end

  def seed_documents(guest)
    %w[Onboarding Release-checklist Architecture-notes].each do |name|
      next if guest.pdf_documents.exists?(title: "Demo #{name.tr('-', ' ')}")
      PdfDocuments::Manager.create_from_path!(user: guest, path: Rails.root.join("public/demo/nexus-hub-sample.pdf").to_s,
        filename: "demo-#{name.downcase}.pdf", title: "Demo #{name.tr('-', ' ')}")
    end
  end
end
