# Synthetic inventory only: these records do not connect to or deploy infrastructure.
class DemoOperationsSeeder
  def call(project:, owner:, reviewer:)
    ProjectOperationItem.transaction do
      environments = %w[Development Staging Production QA Preview Recovery].map do |name|
        environment = ProjectEnvironment.find_or_initialize_by(project: project, name: name)
        environment.update!(url: "https://#{name.downcase}.example.test", description: "Synthetic #{name.downcase} inventory; no live infrastructure.")
        environment
      end

      seed_item(project, owner, kind: "configuration", name: "APP_REGION", secret: false, comparison: "must_match",
        description: "Synthetic public region. Values require the configured operations encryption key.",
        entries: environments.map { |environment| configuration_entry(environment, "ap-south-1") })
      credential = seed_item(project, owner, kind: "configuration", name: "DEMO_API_TOKEN", secret: true,
        description: "Synthetic write-only credential, never a real service token.",
        entries: environments.map { |environment| configuration_entry(environment, "demo-only-#{environment.name.downcase}") })
      service = seed_item(project, owner, kind: "service", name: "Showcase API", details: { owner_id: owner.id, purpose: "Synthetic application endpoints" },
        entries: environments.map { |environment| { environment_id: environment.id, details: { endpoints: [
          { label: "API", url: "https://#{environment.name.downcase}.example.test/api" },
          { label: "Health", url: "https://#{environment.name.downcase}.example.test/health" }
        ], credential_item_ids: [credential.id] } } })
      software = seed_item(project, owner, kind: "software", name: "Showcase API release", comparison: "must_match",
        details: { ecosystem: "Application", purpose: "Demonstrate recorded version drift", service_id: service.id },
        entries: environments.each_with_index.map do |environment, index|
          { environment_id: environment.id, expected_version: "2.4.0", observed_version: index == 2 ? "2.3.0" : "2.4.0",
            observed_at: Time.current.iso8601, source: "synthetic_seed", verify_observation: index != 2 }
        end)
      seed_item(project, owner, kind: "license", name: "Demo monitoring subscription", description: "Synthetic licence with no real key or vendor account.",
        details: { owner_id: owner.id, environment_ids: environments.map(&:id), service_ids: [service.id],
          expiry_date: (Date.current + 45.days).iso8601, time_zone: "Asia/Kolkata", recipient_ids: [reviewer.id],
          reminder_days: [], vendor: "Example vendor", license_type: "Demo subscription" })

      seed_variants(project, owner, reviewer, environments)

      series = ProjectDeploymentSeries.find_or_initialize_by(project: project, name: "Weekly staging rehearsal")
      if series.new_record?
        series.assign_attributes(project_environment: environments[1], owner: owner, recipient_ids: [reviewer.id],
          time_zone: "Asia/Kolkata", frequency: "weekly", weekdays: [Date.current.wday], local_time: "15:00",
          starts_on: Date.current + 7.days, ends_on: Date.current + 28.days, reminder_minutes: [],
          targets: [{ "item_id" => software.id, "expected_version" => "2.4.0" }],
          notes: "Synthetic recurring release rehearsal; reminder delivery disabled.")
        series.save!
        Operations::Schedules.materialize!(series)
      end

      deployment = ProjectDeployment.find_or_initialize_by(project: project, name: "Showcase production release")
      if deployment.new_record?
        deployment.assign_attributes(project_environment: environments[2], owner: owner, recipient_ids: [reviewer.id],
          scheduled_at: 3.days.from_now.beginning_of_hour, time_zone: "Asia/Kolkata", reminder_minutes: [],
          targets: [{ "item_id" => software.id, "expected_version" => "2.4.0" }],
          notes: "Synthetic planned release. This record does not execute deployments; reminder delivery is disabled for the demo.")
        deployment.save!
        Operations::Schedules.sync_deployment!(deployment)
      end
    end
  end

  private

  def seed_variants(project, owner, reviewer, environments)
    settings = {
      "LOG_LEVEL" => ["debug", "info", "warn", "debug", "debug", "warn"],
      "FEATURE_RELEASE_PREVIEW" => ["true", "true", "false", "true", "true", "false"],
      "PUBLIC_API_TIMEOUT" => ["10", "20", "30", "15", nil, "60"]
    }
    settings.each do |name, values|
      seed_item(project, owner, kind: "configuration", name: name, secret: false, comparison: "environment_specific",
        description: "Synthetic environment-specific setting; Preview intentionally has a missing required timeout.",
        entries: environments.each_with_index.map { |environment, index| configuration_entry(environment, values[index]) })
    end
    seed_item(project, owner, kind: "configuration", name: "SESSION_SCHEMA_VERSION", secret: false, comparison: "must_match",
      description: "Recovery intentionally differs from the shared session schema baseline.",
      entries: environments.each_with_index.map { |environment, index| configuration_entry(environment, index == 5 ? "v1" : "v2") })
    service = seed_item(project, owner, kind: "service", name: "Demo background worker",
      details: { owner_id: reviewer.id, purpose: "Synthetic queue processing and health inventory" },
      entries: environments.map do |environment|
        { environment_id: environment.id, details: { endpoints: environment.name == "Preview" ? [] : [
          { label: "Worker health", url: "https://#{environment.name.downcase}.example.test/worker/health" }
        ], credential_item_ids: [] } }
      end)
    worker = seed_item(project, owner, kind: "software", name: "Worker release", comparison: "must_match",
      details: { ecosystem: "Application", purpose: "Matching, drifted and unobserved inventory examples", service_id: service.id },
      entries: environments.each_with_index.map do |environment, index|
        observed = ["1.8.0", "1.8.0", "1.7.2", "1.8.0", nil, "1.6.0"][index]
        { environment_id: environment.id, expected_version: "1.8.0", observed_version: observed,
          observed_at: observed ? 2.hours.ago.iso8601 : nil, source: "synthetic_seed", verify_observation: index == 1 }
      end)
    [
      ["Demo QA tooling trial", [environments[3].id, environments[4].id], (Date.current + 5.days).iso8601],
      ["Demo recovery support expired", [environments[5].id], (Date.current - 10.days).iso8601],
      ["Demo worker perpetual licence", environments.first(3).map(&:id), nil]
    ].each do |name, coverage, expiry|
      seed_item(project, owner, kind: "license", name: name, description: "Synthetic licence scenario; no real licence key.",
        details: { owner_id: reviewer.id, environment_ids: coverage, service_ids: [service.id], expiry_date: expiry,
          time_zone: "Asia/Kolkata", recipient_ids: [owner.id], reminder_days: [], vendor: "Example vendor" })
    end
    [
      ["QA worker rollout", environments[3], "in_progress", 1.hour.ago],
      ["Recovery worker rollout failed", environments[5], "failed", 2.days.ago],
      ["Preview worker rollout cancelled", environments[4], "cancelled", 1.day.from_now],
      ["Production worker observation pending", environments[2], "deployed", 1.day.ago]
    ].each do |name, environment, status, scheduled_at|
      next if ProjectDeployment.exists?(project: project, name: name)

      deployment = ProjectDeployment.create!(project: project, project_environment: environment, owner: owner,
        name: name, status: status, scheduled_at: scheduled_at, time_zone: "Asia/Kolkata", recipient_ids: [reviewer.id],
        reminder_minutes: [], targets: [{ "item_id" => worker.id, "expected_version" => "1.8.0" }],
        started_at: status == "cancelled" ? nil : scheduled_at,
        deployed_at: status == "deployed" ? scheduled_at + 30.minutes : nil,
        notes: "Synthetic execution state; no infrastructure action or reminder delivery.")
      Operations::Schedules.sync_deployment!(deployment)
    end
  end

  def configuration_entry(environment, value)
    attributes = { environment_id: environment.id, required: true }
    attributes[:value] = value if Operations::Encryption.available?
    attributes
  end

  # Preserve existing encrypted values, observation history, dates and revisions on reruns.
  def seed_item(project, owner, attributes)
    existing = ProjectOperationItem.find_by(project: project, kind: attributes.fetch(:kind), name: attributes.fetch(:name))
    if existing
      Array(attributes[:entries]).each do |entry|
        next if existing.entries.exists?(project_environment_id: entry.fetch(:environment_id))

        Operations::Mutation.new(project: project, actor: owner, revision: project.reload.operations_revision)
          .call(action: :update_entry, item: existing, environment: entry.fetch(:environment_id),
            attributes: entry.except(:environment_id), reason: "Add synthetic inventory for another demo environment")
      end
      return existing
    end

    result = Operations::Mutation.new(project: project, actor: owner, revision: project.reload.operations_revision)
      .call(action: :create, attributes: attributes, reason: "Add synthetic portfolio showcase inventory")
    ProjectOperationItem.find(result.fetch(:item).fetch(:id))
  end
end
