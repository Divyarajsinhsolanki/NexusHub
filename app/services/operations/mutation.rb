module Operations
  class Mutation
    ITEM_FIELDS = %w[kind name description category secret comparison details].freeze
    ENTRY_FIELDS = %w[required expected_version observed_version observed_at source details].freeze
    AUDIT_FIELDS = (ITEM_FIELDS + ENTRY_FIELDS + %w[value license_key entries environments schedule status verified verify_observation]).freeze

    attr_reader :project, :actor, :revision

    def initialize(project:, actor:, revision:, require_revision: true)
      @project, @actor, @revision, @require_revision = project, actor, revision, require_revision
    end

    def run(event:, reason: nil)
      Policy.new(project, actor).authorize_edit!
      @reason = reason.to_s.strip.presence
      raise Error, "Change reason must be 500 characters or fewer." if @reason.to_s.length > 500
      @audited = false
      project.with_lock do
        Policy.new(project, actor).authorize_edit!
        verify_revision!
        result = yield(self)
        audit!(action: event) unless @audited
        project.update!(operations_revision: project.operations_revision + 1)
        (result.is_a?(Hash) ? result : {}).merge(revision: project.operations_revision)
      end
    end

    def call(action:, item: nil, environment: nil, attributes: {}, reason: nil)
      attrs = attributes.to_h.deep_stringify_keys
      run(event: action.to_s, reason: reason) do
        case action.to_s
        when "create"
          item = ProjectOperationItem.new(attrs.slice(*ITEM_FIELDS).merge(project: project, workspace: project.workspace))
          write_license_key!(item, attrs)
          item.save!
          write_entries!(item, attrs)
          sync_license(item)
          audit!(action: "item_created", item: item, fields: attrs.keys)
        when "update"
          item = project_item!(item)
          previous_details = item.details.deep_dup
          item.assign_attributes(attrs.slice(*ITEM_FIELDS))
          write_license_key!(item, attrs)
          item.save!
          write_entries!(item, attrs)
          sync_license(item)
          audit!(action: "item_updated", item: item, fields: attrs.keys, metadata: license_history(item, previous_details))
        when "destroy"
          item = project_item!(item)
          ensure_unreferenced!(item)
          if item.kind == "license" && defined?(Operations::Schedules)
            Operations::Schedules.cleanup_item!(item, actor: actor)
          end
          audit!(action: "item_deleted", item: item)
          item.destroy!
          next {}
        when "update_entry"
          item = project_item!(item)
          env = project.project_environments.find(environment.respond_to?(:id) ? environment.id : environment)
          write_entry!(item, env, attrs)
          audit!(action: "entry_updated", item: item, environment: env, fields: attrs.keys)
        else
          raise Error, "Unsupported operation."
        end
        { item: Snapshot.new(project: project, user: actor).serialize_item(item.reload) }
      end
    end

    def audit!(action:, item: nil, item_name: nil, environment: nil, fields: [], metadata: {})
      safe_metadata = metadata.to_h.stringify_keys.slice(*(ProjectOperationChange::METADATA_FIELDS - %w[fields revision]))
      safe_metadata["fields"] = Array(fields).map(&:to_s) & AUDIT_FIELDS
      safe_metadata["item_id"] = item.id if item
      safe_metadata["environment_id"] = environment.id if environment
      safe_metadata["revision"] = project.operations_revision + 1
      ProjectOperationChange.create!(
        workspace: project.workspace, project: project, actor: actor, action: action.to_s.first(100),
        item_kind: item&.kind, item_name: item&.name || item_name&.to_s&.first(160), environment_name: environment&.name,
        metadata: safe_metadata, reason: @reason
      )
      @audited = true
    end

    def write_entry!(item, environment, attrs)
      attrs = attrs.to_h.deep_stringify_keys
      entry = item.entries.find_or_initialize_by(project_environment: environment)
      entry.project = project
      entry.workspace = project.workspace
      entry.updated_by = actor
      allowed = item.kind == "software" ? ENTRY_FIELDS : ENTRY_FIELDS - %w[expected_version observed_version observed_at]
      entry.assign_attributes(attrs.slice(*allowed))
      if item.kind == "software"
        %w[expected_version observed_version].each do |field|
          entry.public_send("#{field}=", attrs[field].to_s.strip.presence) if attrs.key?(field)
        end
        if attrs.key?("observed_version")
          entry.observed_at = entry.observed_version.present? ? parse_observed_at(attrs["observed_at"]) : nil
        elsif attrs.key?("observed_at")
          entry.observed_at = attrs["observed_at"].present? ? parse_observed_at(attrs["observed_at"]) : nil
        end
        if (attrs.keys & %w[expected_version observed_version observed_at source]).any?
          entry.verified_at = nil
          entry.verified_by = nil
        end
        if ActiveModel::Type::Boolean.new.cast(attrs["verify_observation"])
          unless entry.expected_version.present? && entry.expected_version == entry.observed_version && entry.observed_at.present?
            raise Error, "Record matching expected and observed versions before confirming this version."
          end
          entry.verified_at = Time.current
          entry.verified_by = actor
        end
      end
      if item.kind == "configuration"
        write_encrypted!(entry, :value, attrs, clear_key: "clear_value")
      elsif attrs.key?("value") || attrs.key?("clear_value")
        raise Error, "Values are only accepted for configuration items."
      end
      entry.save!
      entry
    end

    private

    def write_entries!(item, attrs)
      nested_entries = attrs.fetch("entries", [])
      raise Error, "Entries must be a list." unless nested_entries.is_a?(Array)
      raise Error, "Too many environment entries." if nested_entries.length > 100
      ids = nested_entries.map do |entry_attrs|
        raise Error, "Each entry must be an object." unless entry_attrs.is_a?(Hash)
        entry_attrs["environment_id"].to_s
      end
      raise Error, "Include each environment only once." if ids.uniq.length != ids.length
      nested_entries.each do |entry_attrs|
        env = project.project_environments.find(entry_attrs["environment_id"])
        write_entry!(item, env, entry_attrs)
      end
    end

    def license_history(item, previous_details)
      return {} unless item.kind == "license"
      %w[expiry_date time_zone].each_with_object({}) do |field, data|
        next if previous_details[field] == item.details[field]
        data["#{field}_before"] = previous_details[field]
        data["#{field}_after"] = item.details[field]
      end
    end

    def verify_revision!
      if revision.nil? && !@require_revision
        return
      end
      unless revision.to_s.match?(/\A\d+\z/)
        raise Error, "A valid configuration revision is required. Refresh and try again."
      end
      raise StaleRevision, "Configuration changed in another request. Refresh before saving." unless revision.to_i == project.operations_revision
    end

    def project_item!(item)
      ProjectOperationItem.where(project: project).find(item.respond_to?(:id) ? item.id : item)
    end

    def write_license_key!(item, attrs)
      return unless attrs.key?("license_key") || attrs.key?("clear_license_key")
      raise Error, "License keys are only accepted for license items." unless item.kind == "license"
      write_encrypted!(item, :license_key, attrs, clear_key: "clear_license_key")
    end

    def write_encrypted!(record, attribute, attrs, clear_key:)
      name = attribute.to_s
      return unless attrs.key?(name) || attrs.key?(clear_key)
      # Verify an existing ciphertext before allowing replacement, including clear.
      existing = record.public_send("encrypted_#{name}")
      Encryption.read(record, attribute) if existing.present?
      Encryption.key
      clear = ActiveModel::Type::Boolean.new.cast(attrs[clear_key])
      if clear
        record.public_send("#{attribute}=", nil)
      elsif attrs.key?(name)
        raise Error, "A configuration value must be text." unless attrs[name].is_a?(String) || attrs[name].nil?
        raise Error, "A configuration value must be 64KB or smaller." if attrs[name].to_s.bytesize > 65_536
        record.public_send("#{attribute}=", attrs[name].presence)
      end
    end

    def parse_observed_at(value)
      return Time.current if value.blank?
      raise ArgumentError unless value.to_s.match?(/(?:Z|[+-]\d\d:\d\d)\z/)
      Time.iso8601(value.to_s)
    rescue ArgumentError
      raise Error, "Observed time must be an ISO 8601 timestamp."
    end

    def sync_license(item)
      return unless item.kind == "license" && defined?(Operations::Schedules)
      Operations::Schedules.sync_item!(item, actor: actor)
    end

    def ensure_unreferenced!(item)
      if item.kind == "configuration"
        referenced = ProjectOperationEntry.where(project: project).where("details->'credential_item_ids' @> ?::jsonb", [item.id].to_json).exists? ||
          ProjectOperationEntry.where(project: project).where("details->'credential_item_ids' @> ?::jsonb", [item.id.to_s].to_json).exists?
        raise Error, "Remove this credential from linked services before deleting it." if referenced
      elsif item.kind == "service"
        referenced = ProjectOperationItem.where(project: project, kind: "license").where("details->'service_ids' @> ?::jsonb", [item.id].to_json).exists? ||
          ProjectOperationItem.where(project: project, kind: "license").where("details->'service_ids' @> ?::jsonb", [item.id.to_s].to_json).exists?
        raise Error, "Remove this service from linked licenses before deleting it." if referenced
        linked_software = ProjectOperationItem.where(project: project, kind: "software").where("details->>'service_id' = ?", item.id.to_s).exists?
        raise Error, "Remove this service from linked software before deleting it." if linked_software
      elsif item.kind == "software"
        [ProjectDeployment, ProjectDeploymentSeries].each do |model|
          referenced = model.where(project: project).where("targets @> ?::jsonb", [{ item_id: item.id }].to_json).exists?
          raise Error, "This software is referenced by deployment targets and must be kept for verification history." if referenced
        end
      end
    end
  end
end
