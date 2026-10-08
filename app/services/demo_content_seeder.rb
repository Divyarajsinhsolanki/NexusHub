# Fixed synthetic examples keep repeated demo refreshes predictable.
class DemoContentSeeder
  def call(project:, guest:, engineer:, reviewer:, designer:, operator:)
    users = [guest, engineer, reviewer, designer, operator]
    seed_vault(project)
    seed_teams(users)
    seed_posts(users)
    seed_learning(guest)
    DemoExpansionSeeder.new.call(project: project, users: users)
  end

  private

  def seed_vault(project)
    environments = project.project_environments.index_by(&:name)
    [
      ["Demo staging login", "Credential", "Staging", "demo-password-not-a-real-login", "demo-reviewer"],
      ["Demo integration token", "Token", "Development", "demo-token-placeholder-no-access", nil],
      ["Local development commands", "Command", "Development", "bin/rails db:prepare\nbin/dev", nil],
      ["Staging smoke-test checklist", "Note", "Staging", "Check sign-in, project membership, task boards, chat, PDF export, and calendar links using synthetic accounts.", nil],
      ["Production incident runbook", "Note", "Production", "Record the incident timeline, inspect health checks, confirm the release version, and document recovery. This is a synthetic runbook.", nil],
      ["Recovery server inventory", "Server", "Recovery", "Host: recovery.example.test\nPurpose: synthetic disaster-recovery inventory\nNo live server connection.", nil],
      ["QA database inventory", "Database", "QA", "Database: nexus_demo_qa\nHost: database.qa.example.test\nSynthetic inventory only; no usable connection credentials.", nil],
      ["Release 2.4 change notes", "Update", "Production", "Environment comparison, licence calendars, release target snapshots, and reviewed version observations are ready for the demo.", nil],
      ["Team onboarding guide", "Info", nil, "Start with the Product Team, review the sprint board, explore environment comparisons, and read the release checklist.", nil],
      ["Project delivery preview", "Media", nil, "/portfolio-seed-images/01-project-delivery", nil],
      ["Planning workspace preview", "Media", nil, "/portfolio-seed-images/02-planning-focus", nil],
      ["Collaboration workspace preview", "Media", nil, "/portfolio-seed-images/03-collaboration", nil]
    ].each do |title, category, environment_name, content, username|
      content = ShowcaseMedia.url("#{File.basename(content)}.webp") if category == "Media"
      item = ProjectVaultItem.find_or_create_by!(project: project, title: title) do |item|
        item.assign_attributes(category: category, project_environment: environments[environment_name], content: content, username: username)
      end
      item.update!(content: content) if category == "Media" && item.content.start_with?("/portfolio-seed-images/") && item.content != content
    end
  end

  def seed_teams(users)
    guest, engineer, reviewer, designer, operator = users
    [
      ["Design & Experience", designer, [designer], "Interaction design, accessibility, and product discovery."],
      ["Quality Engineering", reviewer, [reviewer], "Exploratory testing, regression coverage, and release readiness."],
      ["Platform Operations", operator, [operator], "Release planning, environment inventory, and recovery practice."]
    ].each do |name, manager, members, description|
      department = Department.find_or_initialize_by(name: name)
      department.update!(manager: manager, description: "Synthetic demo department. #{description}")
      members.each { |user| user.update!(department: department) }
    end
    [
      ["Experience Studio", designer, [guest, designer, engineer], "A small team exploring navigation and accessible interfaces."],
      ["Release Readiness", reviewer, [guest, reviewer, engineer, operator], "Cross-functional release reviews and quality checks."],
      ["Platform Guild", operator, [guest, operator, engineer], "Environment consistency, operational documentation, and recovery rehearsals."]
    ].each do |name, owner, members, description|
      team = Team.find_or_initialize_by(name: name)
      team.update!(owner: owner, description: "Synthetic demo team. #{description}")
      members.each do |user|
        TeamUser.find_or_initialize_by(team: team, user: user).update!(role: user == owner ? "admin" : user == guest ? "viewer" : "member", status: "accepted")
      end
    end
    [
      [engineer, "React", "Frontend", "advanced", designer],
      [reviewer, "Test Automation", "Quality", "expert", engineer],
      [designer, "Accessibility", "Design", "advanced", reviewer],
      [operator, "Release Operations", "Platform", "advanced", engineer]
    ].each do |user, name, category, proficiency, endorser|
      skill = Skill.find_or_create_by!(name: name) { |record| record.category = category }
      user_skill = UserSkill.find_or_initialize_by(user: user, skill: skill)
      user_skill.update!(proficiency: proficiency)
      shared_team = Team.joins(:team_users).where(team_users: { user_id: user.id, status: "accepted" })
        .where(id: TeamUser.where(user: endorser, status: "accepted").select(:team_id)).first
      SkillEndorsement.find_or_create_by!(user_skill: user_skill, endorser: endorser) { |record| record.team = shared_team }
    end
  end

  def seed_posts(users)
    guest, engineer, reviewer, designer, operator = users
    [
      [designer, "A little navigation polish goes a long way. Here is the demo workspace layout we reviewed this morning.", "01-project-delivery.webp"],
      [reviewer, "Today's QA challenge: compare Staging and Production, spot the version drift, then check the missing Preview configuration.", nil],
      [operator, "Release rehearsal complete! The demo runbook now covers environment checks, version observations, and recovery notes.", "06-platform-engineering.webp"],
      [engineer, "Small win: the sprint board, issue workflow, and environment inventory now tell one connected delivery story.", nil],
      [designer, "Focus-session idea: pick one priority, block 25 minutes, and leave a short note for tomorrow. The planning preview is attached.", "02-planning-focus.webp"],
      [reviewer, "PDF review club: try the sample document and explore annotations, signatures, and export tools in the guided tour.", "05-pdf-workflows.webp"],
      [engineer, "What should we explore next: bookmarks, team learning goals, or the knowledge grid? My vote is the learning checkpoints.", "04-knowledge-learning.webp"],
      [operator, "Friday demo tip: licences can cover several environments, have an upcoming expiry, or remain valid without an expiry date.", nil],
      [designer, "A quick appreciation post for our synthetic demo team. Good handoffs and clear comments make collaboration easier.", "03-collaboration.webp"],
      [reviewer, "Accessibility checklist for the week: keyboard navigation, readable labels, responsive tables, and clear empty states.", nil]
    ].each_with_index do |(author, message, filename), index|
      post = Post.find_or_create_by!(user: author, message: message) { |record| record.created_at = index.hours.ago }
      ShowcaseMedia.attach!(post.image, filename) if filename
      [guest, engineer, reviewer].reject { |user| user == author }.first(2).each do |user|
        PostLike.find_or_create_by!(post: post, user: user)
      end
      commenter = author == reviewer ? engineer : reviewer
      Comment.find_or_create_by!(post: post, user: commenter, body: [
        "Great example for the guided tour. All records shown here are synthetic.",
        "Added this to our next demo review checklist.",
        "Clear handoff. The team can follow this from the project dashboard."
      ][index % 3])
    end
  end

  def seed_learning(guest)
    [
      ["Practice accessible interface reviews", "Experience Studio", "Review keyboard navigation", "Check responsive layouts"],
      ["Understand release readiness", "Release Readiness", "Compare environment versions", "Review the licence expiry calendar"],
      ["Explore platform recovery workflows", "Platform Guild", "Read the recovery runbook", "Inspect a failed release record"]
    ].each do |title, team_name, first_step, second_step|
      goal = LearningGoal.find_or_create_by!(user: guest, title: title) do |record|
        record.assign_attributes(team: Team.find_by!(name: team_name), description: "Synthetic guided learning path for demo visitors.", due_date: Date.current + 14.days, progress: 50)
      end
      [first_step, second_step].each_with_index do |step, index|
        LearningCheckpoint.find_or_create_by!(learning_goal: goal, title: step) { |record| record.completed = index.zero? }
      end
    end
  end
end
