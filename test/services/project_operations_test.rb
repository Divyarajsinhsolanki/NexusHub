require "test_helper"

class ProjectOperationsTest < ActiveSupport::TestCase
  setup do
    @previous_key = ENV["PROJECT_OPERATIONS_ENCRYPTION_KEY"]
    ENV["PROJECT_OPERATIONS_ENCRYPTION_KEY"] = "a1" * 32
    @workspace = Workspace.create!(name: "Operations", slug: "operations-service", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "operations@example.test")
    Current.workspace = @workspace
    @project = Project.create!(name: "Operations project", owner: @user)
    @membership = ProjectUser.create!(project: @project, user: @user, role: "developer", status: "active")
    @dev = ProjectEnvironment.create!(project: @project, name: "Development")
    @prod = ProjectEnvironment.create!(project: @project, name: "Production")
    Current.user = @user
  end

  teardown do
    ENV["PROJECT_OPERATIONS_ENCRYPTION_KEY"] = @previous_key
  end

  test "encrypted secrets compare without leaking plaintext ciphertext or fingerprints" do
    result = create_item(name: "PAYMENT_TOKEN", comparison: "must_match", entries: [
      { environment_id: @dev.id, required: true, value: "very-private-token" },
      { environment_id: @prod.id, required: true, value: "very-private-token" }
    ])
    item = ProjectOperationItem.find(result[:item][:id])
    entry = item.entries.first
    assert_not_equal "very-private-token", entry.encrypted_value
    assert_equal "very-private-token", entry.value
    assert_not_includes entry.serializable_hash.keys, "encrypted_value"
    snapshot = snapshot()
    row = snapshot[:items].first
    assert_equal "match", row[:status]
    assert_equal true, row[:comparisons].first[:equal]
    assert_not_includes snapshot.to_json, "very-private-token"
    assert_not_includes snapshot.to_json, entry.encrypted_value
    assert_not row[:entries].first.key?(:value)
    assert_equal 1, snapshot[:history].length
    assert_equal 1, snapshot[:revision]

    update_entry(item, @prod, value: "different-private-token")
    assert_equal "mismatch", snapshot()[:items].first[:status]
    assert_equal false, snapshot()[:items].first[:comparisons].first[:equal]
    assert_not_includes snapshot().to_json, "different-private-token"
  end

  test "public values are encrypted at rest and only explicitly public values are returned" do
    result = create_item(name: "REGION", secret: false, entries: [{ environment_id: @dev.id, value: "ap-south-1" }])
    item = ProjectOperationItem.find(result[:item][:id])
    assert_equal "ap-south-1", result[:item][:entries].first[:value]
    assert_not_includes item.entries.first.encrypted_value, "ap-south-1"

    mutate(:update, item: item, attributes: { secret: true })
    assert_raises(ActiveRecord::RecordInvalid) { mutate(:update, item: item, attributes: { secret: false }) }
    assert item.reload.secret?
  end

  test "stale edits preserve stored values and do not add history" do
    result = create_item(name: "API_TOKEN", entries: [{ environment_id: @dev.id, value: "original" }])
    item = ProjectOperationItem.find(result[:item][:id])
    update_entry(item, @dev, value: "newer")
    revision, changes = @project.reload.operations_revision, ProjectOperationChange.count
    assert_raises(Operations::StaleRevision) do
      Operations::Mutation.new(project: @project, actor: @user, revision: revision - 1).call(
        action: :update_entry, item: item, environment: @dev, attributes: { value: "stale" }
      )
    end
    assert_equal "newer", item.entries.first.reload.value
    assert_equal changes, ProjectOperationChange.count
    assert_equal revision, @project.reload.operations_revision
  end

  test "omitted values remain unchanged and explicit clears make required entries missing" do
    result = create_item(name: "CACHE_URL", entries: [{ environment_id: @dev.id, value: "private-url" }])
    item = ProjectOperationItem.find(result[:item][:id])
    update_entry(item, @dev, required: true)
    assert_equal "private-url", item.entries.first.reload.value
    update_entry(item, @dev, clear_value: true)
    assert_nil item.entries.first.reload.encrypted_value
    assert_equal "missing", snapshot()[:items].first[:status]
    assert_equal 1, snapshot()[:summary][:missing_required]
  end

  test "workspace owners still need active project membership and viewers cannot edit" do
    assert Operations::Policy.new(@project, @user).edit?
    @membership.update!(role: "viewer")
    assert Operations::Policy.new(@project, @user).read?
    assert_not Operations::Policy.new(@project, @user).edit?
    assert_raises(Operations::Forbidden) { create_item(name: "VIEWER_WRITE") }
    @membership.update!(status: "removed")
    UserRole.create!(workspace: @workspace, user: @user, role: Role.find_by!(name: "owner"))
    assert_raises(ActiveRecord::RecordNotFound) { snapshot() }
  end

  test "cross-project entries rollback the complete initial item transaction" do
    foreign_project = Project.create!(name: "Other project")
    foreign_env = ProjectEnvironment.create!(project: foreign_project, name: "Foreign")
    assert_no_difference ["ProjectOperationItem.count", "ProjectOperationEntry.count", "ProjectOperationChange.count"] do
      assert_raises(ActiveRecord::RecordNotFound) do
        create_item(name: "ATOMIC", entries: [
          { environment_id: @dev.id, value: "private" },
          { environment_id: foreign_env.id, value: "private" }
        ])
      end
    end
    assert_equal 0, @project.reload.operations_revision
  end

  test "encryption configuration failure is visible without exposing values or replacing unreadable data" do
    result = create_item(name: "TOKEN", entries: [{ environment_id: @dev.id, value: "keep-me" }])
    item = ProjectOperationItem.find(result[:item][:id])
    ciphertext = item.entries.first.encrypted_value
    ENV["PROJECT_OPERATIONS_ENCRYPTION_KEY"] = "b2" * 32
    assert_equal "unavailable", snapshot()[:items].first[:status]
    assert_raises(Operations::EncryptionUnavailable) { update_entry(item, @dev, value: "replacement") }
    assert_equal ciphertext, item.entries.first.reload.encrypted_value
    ENV.delete("PROJECT_OPERATIONS_ENCRYPTION_KEY")
    assert_not snapshot()[:encryption_available]
    assert_raises(Operations::EncryptionUnavailable) { create_item(name: "NEW_TOKEN", entries: [{ environment_id: @prod.id, value: "new" }]) }
  end

  test "dotenv preview never exposes values and selective merge preserves omitted keys and metadata" do
    result = create_item(name: "KEEP", entries: [{ environment_id: @dev.id, required: true, value: "old" }])
    untouched = create_item(name: "UNTOUCHED", entries: [{ environment_id: @dev.id, value: "retained" }])
    content = "# comment\nKEEP=updated\nNEW_TOKEN='sensitive-content'\nPUBLIC_REGION=ap-south-1\n"
    preview = imports.preview(format: "env", environment_id: @dev.id, content: content)
    assert_equal 3, preview[:rows].length
    assert_not_includes preview.to_json, "sensitive-content"
    assert_not_includes preview.to_json, "updated"
    before = @project.reload.operations_revision
    committed = imports.commit(format: "env", environment_id: @dev.id, content: content, revision: before, selected_keys: %w[KEEP PUBLIC_REGION], public_keys: %w[PUBLIC_REGION])
    assert_equal before + 1, committed[:revision]
    assert_equal 2, committed[:imported_count]
    kept = ProjectOperationItem.find(result[:item][:id]).entries.first
    assert kept.required?
    assert_equal "updated", kept.value
    assert_equal "retained", ProjectOperationItem.find(untouched[:item][:id]).entries.first.value
    assert_nil ProjectOperationItem.find_by(name: "NEW_TOKEN")
    assert_not ProjectOperationItem.find_by!(name: "PUBLIC_REGION").secret?
  end

  test "dotenv is parsed without shell execution expansion or interpolation" do
    content = "export TOKEN=\"line\\nnext\" # comment\nLITERAL='${HOME} $(touch /tmp/never-execute-operations)'\nMULTI=\"first\nsecond\"\nHASH=value#literal\nEMPTY=\n"
    imports.commit(format: "env", environment_id: @dev.id, content: content, revision: 0, selected_keys: %w[TOKEN LITERAL MULTI HASH EMPTY])
    values = ProjectOperationItem.includes(:entries).index_with { |item| item.entries.first.value }.transform_keys(&:name)
    assert_equal "line\nnext", values["TOKEN"]
    assert_equal '${HOME} $(touch /tmp/never-execute-operations)', values["LITERAL"]
    assert_equal "first\nsecond", values["MULTI"]
    assert_equal "value#literal", values["HASH"]
    assert_nil values["EMPTY"]
  end

  test "bad imports expose no source values and commit no partial data" do
    ["GOOD=sensitive\nINVALID sensitive-content\n", "A=one\nA=two", 'A="unterminated-sensitive'].each do |content|
      error = assert_raises(Operations::Error) { imports.preview(format: "env", environment_id: @dev.id, content: content) }
      assert_not_includes error.message, "sensitive"
    end
    assert_equal 0, ProjectOperationItem.count
    assert_equal 0, ProjectOperationChange.count
  end

  test "existing secret classifications cannot be changed by an import" do
    create_item(name: "EXISTING")
    revision = @project.reload.operations_revision
    assert_raises(Operations::Error) do
      imports.commit(format: "env", environment_id: @dev.id, content: "EXISTING=private", revision: revision, selected_keys: ["EXISTING"], public_keys: ["EXISTING"])
    end
    assert_equal revision, @project.reload.operations_revision
    assert_equal 0, ProjectOperationEntry.count
  end

  test "version imports update observations without replacing existing expected baselines" do
    result = create_item(kind: "software", name: "Redis", entries: [{ environment_id: @prod.id, required: true, expected_version: "7.2", observed_version: "7.0" }])
    csv = "name,observed_version,expected_version,ecosystem\nRedis,7.1,9.9,service\nRails,8.1,8.1,rubygems\n"
    imports.commit(format: "versions", environment_id: @prod.id, content: csv, revision: @project.reload.operations_revision, selected_keys: %w[Redis Rails])
    redis = ProjectOperationItem.find(result[:item][:id]).entries.first
    assert_equal "7.2", redis.expected_version
    assert_equal "7.1", redis.observed_version
    assert redis.required?
    assert redis.observed_at.present?
    assert_equal "version_import", redis.source
    assert_equal "mismatch", snapshot()[:items].find { |item| item[:name] == "Redis" }[:status]
  end

  test "service credentials must reference project secret configurations and endpoints exclude credentials" do
    secret = create_item(name: "STRIPE_SECRET")
    service = create_item(kind: "service", name: "Stripe")
    item = ProjectOperationItem.find(service[:item][:id])
    update_entry(item, @dev, details: { endpoint: "https://api.stripe.com/v1", credential_item_ids: [secret[:item][:id]] })
    assert_raises(ActiveRecord::RecordInvalid) { update_entry(item, @dev, details: { endpoint: "https://user:secret@example.test" }) }
    assert_raises(ActiveRecord::RecordInvalid) { update_entry(item, @dev, details: { endpoint: "https://api.example.test/?token=hidden" }) }
    assert_raises(Operations::Error) { mutate(:destroy, item: secret[:item][:id]) }
  end

  test "audit history is immutable and contains no old or new configuration values" do
    result = create_item(name: "TOKEN", entries: [{ environment_id: @dev.id, value: "old-private" }])
    update_entry(ProjectOperationItem.find(result[:item][:id]), @dev, value: "new-private")
    history = snapshot()[:history]
    assert_not_includes history.to_json, "old-private"
    assert_not_includes history.to_json, "new-private"
    assert_equal @user.id, history.first[:actor][:id]
    assert_not ProjectOperationChange.first.update(action: "forged")
  end

  test "item changes and multiple environment entries commit atomically under one revision" do
    result = create_item(name: "ATOMIC_TOKEN", entries: [{ environment_id: @dev.id, value: "initial" }])
    item = ProjectOperationItem.find(result[:item][:id])
    before = @project.reload.operations_revision
    mutate(:update, item: item, attributes: { description: "Both environments", entries: [
      { environment_id: @dev.id, value: "changed" }, { environment_id: @prod.id, required: true, value: "live" }
    ] })
    assert_equal before + 1, @project.reload.operations_revision
    assert_equal "Both environments", item.reload.description
    assert_equal %w[changed live], item.entries.order(:project_environment_id).map(&:value)

    assert_raises(ActiveRecord::RecordNotFound) do
      mutate(:update, item: item, attributes: { description: "Must roll back", entries: [
        { environment_id: @dev.id, value: "must not persist" }, { environment_id: -1, value: "invalid" }
      ] })
    end
    assert_equal "Both environments", item.reload.description
    assert_equal "changed", item.entries.find_by!(project_environment: @dev).value
    assert_equal before + 1, @project.reload.operations_revision
  end

  test "labelled endpoint comparisons include every endpoint independent of ordering" do
    result = create_item(kind: "service", name: "Payments", comparison: "must_match")
    item = ProjectOperationItem.find(result[:item][:id])
    endpoints = [{ label: "API", url: "https://api.example.test" }, { label: "Webhook", url: "https://app.example.test/hook" }]
    update_entry(item, @dev, details: { endpoints: endpoints })
    update_entry(item, @prod, details: { endpoints: endpoints.reverse })
    assert_equal "match", snapshot()[:items].first[:status]
    update_entry(item, @prod, details: { endpoints: [endpoints.first, { label: "Webhook", url: "https://production.example.test/hook" }] })
    assert_equal "mismatch", snapshot()[:items].first[:status]
    assert_equal false, snapshot()[:items].first[:comparisons].first[:equal]
    assert_raises(ActiveRecord::RecordInvalid) { update_entry(item, @prod, details: { endpoints: [{ label: "API", url: "https://user:password@example.test" }] }) }
    assert_raises(ActiveRecord::RecordInvalid) { update_entry(item, @prod, details: { endpoints: [endpoints.first, endpoints.first] }) }
  end

  test "expected imports do not fabricate installed observations and observations require explicit confirmation" do
    csv = "name,expected_version,observed_version\nRedis,7.2,7.2\n"
    imports.commit(format: "versions", environment_id: @prod.id, content: csv, revision: 0, selected_keys: ["Redis"], version_destination: "expected")
    item = ProjectOperationItem.find_by!(name: "Redis")
    entry = item.entries.first
    assert_equal "7.2", entry.expected_version
    assert_nil entry.observed_version
    assert_raises(Operations::Error) { update_entry(item, @prod, verify_observation: true) }
    imports.commit(format: "versions", environment_id: @prod.id, content: "name,observed_version\nRedis,7.2", revision: @project.reload.operations_revision, selected_keys: ["Redis"])
    assert_nil entry.reload.verified_at
    assert_equal "unverified", snapshot()[:items].first[:status]
    update_entry(item, @prod, verify_observation: true)
    assert_equal @user.id, entry.reload.verified_by_id
    assert entry.verified_at
    assert_equal "match", snapshot()[:items].first[:status]
    update_entry(item, @prod, observed_version: "7.1")
    assert_nil entry.reload.verified_at
    assert_nil entry.verified_by_id
    assert_equal "mismatch", snapshot()[:items].first[:status]
  end

  test "software service associations enforce project boundaries and prevent dangling references" do
    service = create_item(kind: "service", name: "Redis hosting")
    software = create_item(kind: "software", name: "Redis", details: { service_id: service[:item][:id] })
    assert_raises(Operations::Error) { mutate(:destroy, item: service[:item][:id]) }
    foreign_project = Project.create!(name: "Foreign service project")
    foreign_service = ProjectOperationItem.create!(project: foreign_project, kind: "service", name: "Foreign")
    assert_raises(ActiveRecord::RecordInvalid) do
      mutate(:update, item: software[:item][:id], attributes: { details: { service_id: foreign_service.id } })
    end
  end

  test "license renewal history retains only safe expiry and timezone metadata" do
    first_date = 60.days.from_now.to_date.iso8601
    new_date = 90.days.from_now.to_date.iso8601
    details = { owner_id: @user.id, expiry_date: first_date, time_zone: "Asia/Kolkata", reference: "INV-123" }
    result = create_item(kind: "license", name: "Database license", license_key: "private-license-key", details: details)
    item = ProjectOperationItem.find(result[:item][:id])
    mutate(:update, item: item, attributes: { details: details.merge(expiry_date: new_date) })
    metadata = snapshot()[:history].first[:metadata]
    assert_equal first_date, metadata["expiry_date_before"]
    assert_equal new_date, metadata["expiry_date_after"]
    assert_not_includes snapshot().to_json, "private-license-key"
    assert_raises(ActiveRecord::RecordInvalid) do
      mutate(:update, item: item, attributes: { details: details.merge(time_zone: "Eastern Time (US & Canada)") })
    end
  end

  test "metadata validation rejects nested arbitrary values and environment summaries distinguish no requirements" do
    assert_raises(ActiveRecord::RecordInvalid) do
      create_item(name: "BAD_DETAILS", details: { documentation_url: { value: "should-not-be-stored" } })
    end
    assert_equal false, snapshot()[:environments].first["requirements_defined"]
    create_item(name: "REQUIRED_TOKEN", entries: [{ environment_id: @dev.id, required: true }])
    environment = snapshot()[:environments].find { |row| row["id"] == @dev.id }
    assert_equal true, environment["requirements_defined"]
    assert_equal 1, environment["missing_required_count"]
    assert_equal 0, environment["configured_required_count"]
  end

  private

  def mutate(action, **args)
    Operations::Mutation.new(project: @project, actor: @user, revision: @project.reload.operations_revision).call(action: action, **args)
  end

  def create_item(**attributes)
    mutate(:create, attributes: { kind: "configuration" }.merge(attributes))
  end

  def update_entry(item, environment, **attributes)
    mutate(:update_entry, item: item, environment: environment, attributes: attributes)
  end

  def snapshot
    Operations::Snapshot.new(project: @project, user: @user).call
  end

  def imports
    Operations::Imports.new(project: @project, actor: @user)
  end
end
