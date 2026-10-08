module Operations
  class Snapshot
    attr_reader :project, :user

    def initialize(project:, user:)
      @project, @user = project, user
    end

    def call
      Policy.new(project, user).authorize_read!
      # Writers use the same lock, so values and the revision describe one state.
      project.with_lock do
        Policy.new(project, user).authorize_read!
        items = ProjectOperationItem.where(project: project).includes(entries: [:project_environment, :updated_by, :verified_by]).order(:kind, :name).map { |item| serialize_item(item) }
        {
          revision: project.operations_revision,
          can_edit: Policy.new(project, user).edit?,
          encryption_available: Encryption.available?,
          environments: project.project_environments.order(:name).map { |env| environment_summary(env, items) },
          members: project.project_users.where(status: "active").includes(:user).map { |member| { id: member.user_id, name: member.user.full_name, role: member.role } },
          items: items,
          history: history,
          summary: {
            items: items.length,
            missing_required: items.sum { |item| item[:entries].count { |entry| entry[:required] && !entry[:configured] } },
            mismatches: items.count { |item| item[:status] == "mismatch" },
            expiring_licenses: items.count { |item| item[:kind] == "license" && item[:status].in?(%w[expired expiring]) },
            unconfigured: items.count { |item| item[:status] == "unconfigured" }
          }
        }.merge(Schedules.snapshot(project))
      end
    end

    def history(before_id: nil, limit: 50)
      Policy.new(project, user).authorize_read!
      if before_id.present? && !before_id.to_s.match?(/\A[1-9]\d*\z/)
        raise Error, "History cursor must be a valid ID."
      end
      scope = ProjectOperationChange.where(project: project).includes(:actor).order(id: :desc)
      scope = scope.where("id < ?", before_id) if before_id.present?
      scope.limit(limit.to_i.clamp(1, 100)).map do |change|
        {
          id: change.id, action: change.action, item_kind: change.item_kind, item_name: change.item_name,
          environment_name: change.environment_name, actor: change.actor && { id: change.actor_id, name: change.actor.full_name },
          reason: change.reason, metadata: change.metadata, created_at: change.created_at
        }
      end
    end

    def serialize_item(item)
      decrypted = {}
      entries = item.entries.sort_by(&:project_environment_id).map do |entry|
        serialized = serialize_entry(entry)
        if item.kind == "configuration" && entry.value_configured?
          begin
            decrypted[entry.project_environment_id] = Encryption.read(entry, :value)
            serialized[:value] = decrypted[entry.project_environment_id] unless item.secret?
          rescue EncryptionUnavailable
            serialized[:value_unavailable] = true
          end
        end
        serialized
      end
      comparisons = entries.select { |entry| entry[:configured] }.combination(2).map do |left, right|
        equal = case item.kind
        when "configuration"
          if decrypted.key?(left[:environment_id]) && decrypted.key?(right[:environment_id])
            decrypted[left[:environment_id]] == decrypted[right[:environment_id]]
          end
        when "software" then left[:observed_version] == right[:observed_version]
        when "service" then endpoint_map(left[:details]) == endpoint_map(right[:details])
        end
        { left_environment_id: left[:environment_id], right_environment_id: right[:environment_id], equal: equal }
      end
      license_key_unavailable = false
      if item.license_key_configured?
        begin
          Encryption.read(item, :license_key)
        rescue EncryptionUnavailable
          license_key_unavailable = true
        end
      end
      {
        id: item.id, kind: item.kind, name: item.name, description: item.description,
        category: item.category, secret: item.secret?, comparison: item.comparison, details: item.details,
        license_key_configured: item.license_key_configured?, license_key_unavailable: license_key_unavailable, entries: entries, comparisons: comparisons,
        status: item_status(item, entries, comparisons), created_at: item.created_at, updated_at: item.updated_at
      }
    ensure
      decrypted&.clear
    end

    private

    def serialize_entry(entry)
      details = entry.details
      if entry.project_operation_item.kind == "service"
        details = details.merge("endpoints" => entry.endpoints, "endpoint" => entry.endpoints.first&.dig("url"))
      end
      {
        id: entry.id, environment_id: entry.project_environment_id, required: entry.required?,
        configured: entry.configured?, expected_version: entry.expected_version, observed_version: entry.observed_version,
        observed_at: entry.observed_at, source: entry.source, details: details,
        verified_at: entry.verified_at, verified_by: entry.verified_by && { id: entry.verified_by_id, name: entry.verified_by.full_name },
        updated_at: entry.updated_at, updated_by: entry.updated_by && { id: entry.updated_by_id, name: entry.updated_by.full_name },
        status: entry_status(entry)
      }
    end

    def entry_status(entry)
      return "missing" if entry.required? && !entry.configured?
      return "unconfigured" unless entry.configured?
      if entry.project_operation_item.kind == "software"
        return "unverified" if entry.expected_version.blank?
        return "mismatch" if entry.expected_version != entry.observed_version
        return entry.verified_at ? "match" : "unverified"
      end
      "configured"
    end

    def item_status(item, entries, comparisons)
      if item.kind == "license"
        return "no_expiry" if item.details["expiry_date"].blank?
        today = Time.current.in_time_zone(item.details["time_zone"]).to_date
        days = (Date.iso8601(item.details["expiry_date"]) - today).to_i
        return "expired" if days.negative?
        return days <= 30 ? "expiring" : "active"
      end
      return "missing" if entries.any? { |entry| entry[:status] == "missing" }
      return "unavailable" if entries.any? { |entry| entry[:value_unavailable] }
      return "unconfigured" unless entries.any? { |entry| entry[:configured] }
      return "mismatch" if entries.any? { |entry| entry[:status] == "mismatch" }
      if comparisons.any? { |comparison| comparison[:equal] == false }
        return item.comparison == "must_match" ? "mismatch" : "expected_differences"
      end
      return "unverified" if item.kind == "software" && entries.any? { |entry| entry[:status] == "unverified" }
      "match"
    end

    def endpoint_map(details)
      details.fetch("endpoints", []).to_h { |endpoint| [endpoint["label"].strip.downcase, endpoint["url"]] }
    end

    def environment_summary(environment, items)
      entries = items.flat_map { |item| item[:entries].select { |entry| entry[:environment_id] == environment.id } }
      required = entries.select { |entry| entry[:required] }
      environment.as_json(only: %i[id name url description]).merge(
        "required_count" => required.length,
        "configured_required_count" => required.count { |entry| entry[:configured] },
        "missing_required_count" => required.count { |entry| !entry[:configured] },
        "requirements_defined" => required.any?,
        "last_recorded_at" => entries.filter_map { |entry| entry[:updated_at] }.max
      )
    end
  end
end
