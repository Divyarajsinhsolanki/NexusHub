require "test_helper"

class ShowcaseSeedersTest < ActiveSupport::TestCase
  test "portfolio and demo seeders are idempotent and synthetic" do
    PortfolioSeeder.new.call
    DemoWorkspaceSeeder.new.call

    first_counts = showcase_counts

    PortfolioSeeder.new.call
    DemoWorkspaceSeeder.new.call

    assert_equal first_counts, showcase_counts
    demo_workspace = Workspace.find_by!(kind: "demo")
    names = demo_workspace.users.order(:id).pluck(:first_name, :last_name)
    assert_includes names, ["Demo", "Visitor"]
    assert_includes names, ["Demo", "Engineer"]
    assert_includes names, ["Demo", "QA"]
    Current.workspace = demo_workspace
    project = Project.find_by!(name: "Nexus Hub Showcase")
    assert_equal %w[configuration license service software], ProjectOperationItem.where(project: project).distinct.order(:kind).pluck(:kind)
    assert ProjectDeployment.where(project: project).count >= 9
    assert_equal 3, ProjectDeploymentSeries.where(project: project).count
    assert CalendarEvent.where(project: project).where.not(operation_source_id: nil).count >= 12
    assert_equal %w[Demo Development Preview Production QA Recovery Staging], project.project_environments.order(:name).pluck(:name)
    assert_equal %w[cancelled deployed failed in_progress planned], ProjectDeployment.where(project: project).distinct.order(:status).pluck(:status)
    worker = ProjectOperationItem.find_by!(project: project, name: "Worker release")
    assert_nil worker.entries.joins(:project_environment).find_by!(project_environments: { name: "Preview" }).observed_version
    assert_equal "1.7.2", worker.entries.joins(:project_environment).find_by!(project_environments: { name: "Production" }).observed_version
    assert_equal 6, ProjectOperationItem.find_by!(project: project, name: "APP_REGION").entries.count
    assert_equal 0, OperationReminderDelivery.where(project: project).count
    assert_equal ProjectVaultItem::CATEGORIES.sort, project.project_vault_items.distinct.pluck(:category).sort
    assert_equal 40, project.project_vault_items.count
    guest = demo_workspace.users.find_by!(email: DemoWorkspaceSeeder::DEMO_EMAIL)
    assert_equal 3, Project.count
    assert_equal 12, guest.items.count
    assert_equal 4, guest.work_logs.count
    assert_equal 4, guest.work_notes.count
    assert_equal 7, Conversation.count
    assert_equal 3, guest.pdf_documents.count
    assert KnowledgePromptRun.where(user: guest).count >= 3
    assert KnowledgeItem.where(user: guest, active: false).count >= 3
    assert guest.knowledge_bookmarks.due_for_reminder.count >= 3
    assert demo_workspace.users.all? { |user| user.user_skills.count >= 3 }
    assert demo_workspace.users.all? { |user| user.profile_picture.attached? }
    Project.find_each do |seeded_project|
      assert_equal 3, ProjectOperationItem.where(project: seeded_project, kind: "service").count
      assert_equal 3, ProjectOperationItem.where(project: seeded_project, kind: "software").count
      assert seeded_project.sprints.count >= 3
      assert seeded_project.tasks.count >= 3
      assert seeded_project.issues.count >= 3
      ProjectVaultItem::CATEGORIES.each do |category|
        assert seeded_project.project_vault_items.where(category: category).count >= 3
      end
    end
    assert_equal 4, Team.count
    assert_equal 4, Department.count
    assert_equal 5, demo_workspace.users.count
    assert_equal 11, Post.count
    assert_equal 6, Post.joins(:image_attachment).count
    assert_equal 4, SkillEndorsement.count
    assert_equal 4, LearningGoal.where(user: demo_workspace.users.find_by!(email: DemoWorkspaceSeeder::DEMO_EMAIL)).count
    Post.joins(:image_attachment).each do |post|
      assert_equal "image/webp", post.image.content_type
      assert post.image.download.bytesize.positive?
    end
    assert_equal 7, PortfolioProject.find_by!(slug: "nexus-hub").portfolio_features.count
    assert_equal "Cloud Deployment and Product Operations", PortfolioFeature.find_by!(position: 7).title
  end

  test "showcase media refreshes stale bundled attachments and preserves custom uploads" do
    PortfolioSeeder.new.call
    project = PortfolioProject.find_by!(slug: "nexus-hub")
    attachment = project.cover_image
    attachment.attach(io: StringIO.new("old screenshot"), filename: "01-project-delivery.webp", content_type: "image/webp")
    old_blob_id = attachment.blob.id
    ShowcaseMedia.attach!(attachment, "01-project-delivery.webp")
    assert_not_equal old_blob_id, attachment.blob.id
    assert_equal Digest::MD5.file(Rails.root.join("app/assets/images/portfolio/01-project-delivery.webp")).base64digest, attachment.blob.checksum
    refreshed_blob_id = attachment.blob.id
    ShowcaseMedia.attach!(attachment, "01-project-delivery.webp")
    assert_equal refreshed_blob_id, attachment.blob.id
    attachment.attach(io: StringIO.new("custom upload"), filename: "custom-cover.webp", content_type: "image/webp")
    custom_blob_id = attachment.blob.id
    ShowcaseMedia.attach!(attachment, "01-project-delivery.webp")
    assert_equal custom_blob_id, attachment.blob.id
  end

  test "personal vault examples stay scoped to the selected user and preserve existing content" do
    workspace = Workspace.create!(name: "Personal vault seed test", slug: "personal-vault-seed-test", kind: "private")
    user = create_test_user(workspace: workspace, email: "personal-vault-seed@example.test")
    Current.workspace = user.workspace
    existing = Item.create!(user: user, title: "Private note", category: "Note", content: "Keep this unchanged")
    previous_workspace = Current.workspace
    previous_user = Current.user
    2.times { PersonalVaultSeeder.new.call(user: user) }
    assert_equal 13, user.items.count
    assert_equal "Keep this unchanged", existing.reload.content
    assert_equal 3, user.items.where(category: "Credential").count
    assert_same previous_workspace, Current.workspace
    assert_same previous_user, Current.user
  end

  private

  def showcase_counts
    demo_workspace = Workspace.find_by!(kind: "demo")
    {
      portfolio_projects: PortfolioProject.count,
      portfolio_features: PortfolioFeature.count,
      demo_users: demo_workspace.users.count,
      demo_projects: Project.unscoped.where(workspace: demo_workspace).count,
      demo_tasks: Task.unscoped.where(workspace: demo_workspace).count,
      operation_items: ProjectOperationItem.unscoped.where(workspace: demo_workspace).count,
      operation_entries: ProjectOperationEntry.unscoped.where(workspace: demo_workspace).count,
      deployments: ProjectDeployment.unscoped.where(workspace: demo_workspace).count,
      operation_changes: ProjectOperationChange.unscoped.where(workspace: demo_workspace).count,
      calendar_events: CalendarEvent.unscoped.where(workspace: demo_workspace).count,
      vault_items: ProjectVaultItem.unscoped.where(workspace: demo_workspace).count,
      teams: Team.unscoped.where(workspace: demo_workspace).count,
      departments: Department.unscoped.where(workspace: demo_workspace).count,
      skills: UserSkill.unscoped.where(workspace: demo_workspace).count,
      endorsements: SkillEndorsement.unscoped.where(workspace: demo_workspace).count,
      learning_goals: LearningGoal.unscoped.where(workspace: demo_workspace).count,
      post_images: ActiveStorage::Attachment.where(record_type: "Post", record_id: Post.unscoped.where(workspace: demo_workspace).select(:id)).count,
      comments: Comment.unscoped.where(workspace: demo_workspace).count,
      likes: PostLike.unscoped.where(workspace: demo_workspace).count,
      personal_vault_items: Item.unscoped.where(workspace: demo_workspace).count,
      work_logs: WorkLog.unscoped.where(workspace: demo_workspace).count,
      work_notes: WorkNote.unscoped.where(workspace: demo_workspace).count,
      knowledge_items: KnowledgeItem.unscoped.where(workspace: demo_workspace).count,
      bookmarks: KnowledgeBookmark.unscoped.where(workspace: demo_workspace).count,
      messages: Message.unscoped.where(workspace: demo_workspace).count,
      sprints: Sprint.unscoped.where(workspace: demo_workspace).count,
      issues: Issue.unscoped.where(workspace: demo_workspace).count,
      task_logs: TaskLog.unscoped.where(workspace: demo_workspace).count,
      documents: PdfDocument.unscoped.where(workspace: demo_workspace).count,
      profile_pictures: ActiveStorage::Attachment.where(record_type: "User", record_id: demo_workspace.users.select(:id)).count,
      demo_posts: Post.unscoped.where(workspace: demo_workspace).count
    }
  end
end
