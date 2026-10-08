require 'csv'

module Operations
  class DeploymentWorkflow
    TRANSITIONS = { 'planned' => %w[in_progress cancelled], 'in_progress' => %w[deployed failed cancelled], 'deployed' => [], 'failed' => [], 'cancelled' => [] }.freeze

    def self.prepare_targets(project, environment_id, targets = nil)
      if targets.nil?
        ProjectOperationEntry.where(project_id: project.id, project_environment_id: environment_id).includes(:project_operation_item).filter_map do |entry|
          next unless entry.project_operation_item.kind == 'software' && entry.expected_version.present?
          { 'item_id' => entry.project_operation_item_id, 'name' => entry.project_operation_item.name, 'expected_version' => entry.expected_version }
        end
      else
        raise Operations::Error, 'Targets must be a list of at most 1,000 software components' unless targets.is_a?(Array) && targets.size <= 1_000
        targets.map do |target|
          raise Operations::Error, 'Each target must be an object' unless target.respond_to?(:to_h)
          row = target.to_h.stringify_keys
          item = ProjectOperationItem.where(project: project, kind: 'software').find(row['item_id'])
          { 'item_id' => item.id, 'name' => item.name, 'expected_version' => row['expected_version'].to_s.strip }
        end
      end
    end

    def self.transition!(deployment, status)
      raise Operations::Error, 'This deployment cannot make that status change' unless TRANSITIONS.fetch(deployment.status).include?(status)
      deployment.status = status
      deployment.started_at = Time.current if status == 'in_progress'
      deployment.deployed_at = Time.current if status == 'deployed'
      deployment.schedule_revision += 1
      deployment.save!
      Schedules.sync_deployment!(deployment)
      deployment
    end

    def self.observe!(deployment, observations)
      raise Operations::Error, 'Record completion before verifying installed versions' unless deployment.status == 'deployed'
      raise Operations::Error, 'Verified deployments cannot be changed' if deployment.verified_at
      raise Operations::Error, 'Observations must be a list of at most 1,000 versions' unless observations.is_a?(Array) && observations.size <= 1_000
      ids = deployment.targets.map { |target| target['item_id'] }
      rows = observations.map do |row|
        raise Operations::Error, 'Each observation must be an object' unless row.respond_to?(:to_h)
        row = row.to_h.stringify_keys
        version = row['observed_version'].to_s.strip
        raise Operations::Error, 'Every observation must reference a deployment target and a version' unless ids.include?(row['item_id'].to_i) && version.present? && version.length <= 160
        { 'item_id' => row['item_id'].to_i, 'observed_version' => version, 'source' => row['source'].to_s.strip.truncate(80).presence || 'Manual verification', 'observed_at' => Time.current.iso8601(6) }
      end
      raise Operations::Error, 'Duplicate observations are not allowed' unless rows.map { |r| r['item_id'] }.uniq.size == rows.size
      deployment.update!(observations: (deployment.observations + rows).index_by { |r| r['item_id'] }.values)
      deployment
    end

    def self.parse_observation_csv(deployment, content)
      raise Operations::Error, 'CSV must be text no larger than 256 KB' unless content.is_a?(String) && content.bytesize <= 262_144
      csv = CSV.parse(content.delete_prefix("\uFEFF"), headers: true)
      headers = csv.headers || []
      unless (headers & %w[name observed_version]).sort == %w[name observed_version] && (headers - %w[name observed_version source]).empty? && headers.uniq.size == headers.size
        raise Operations::Error, 'CSV columns must be name, observed_version, and optional source'
      end
      raise Operations::Error, 'CSV must contain between 1 and 1,000 rows' unless csv.size.between?(1, 1_000)
      targets = deployment.targets.index_by { |target| target['name'] }
      rows = csv.each_with_index.map do |row, index|
        target = targets[row['name'].to_s.strip]
        version = row['observed_version'].to_s.strip
        raise Operations::Error, "CSV row #{index + 2} must name a deployment target and include a version of at most 160 characters" unless target && version.present? && version.length <= 160 && row.fields.size == headers.size
        { 'item_id' => target['item_id'], 'name' => target['name'], 'observed_version' => version, 'source' => row['source'].to_s.strip.truncate(80).presence || 'deployment_import' }
      end
      raise Operations::Error, 'CSV must not contain duplicate components' unless rows.map { |row| row['item_id'] }.uniq.size == rows.size
      rows
    rescue CSV::MalformedCSVError
      raise Operations::Error, 'CSV is malformed; check quoting and column counts'
    end

    def self.verify!(deployment, actor:)
      raise Operations::Error, 'Only completed deployments can be verified' unless deployment.status == 'deployed'
      raise Operations::Error, 'This deployment is already verified' if deployment.verified_at
      raise Operations::Error, 'Every target needs a fresh, matching installed version' unless deployment.targets.any? && deployment.verification.all? { |row| row['status'] == 'match' }
      newer = ProjectDeployment.where(project: deployment.project, project_environment_id: deployment.project_environment_id).where.not(id: deployment.id).where.not(verified_at: nil).where('deployed_at > ? OR (deployed_at = ? AND id > ?)', deployment.deployed_at, deployment.deployed_at, deployment.id).exists?
      raise Operations::Error, 'A newer deployment already established this environment baseline' if newer
      deployment.targets.each do |target|
        item = ProjectOperationItem.where(project_id: deployment.project_id, kind: 'software').find(target['item_id'])
        row = deployment.observations.find { |entry| entry['item_id'] == item.id }
        entry = item.entries.find_or_initialize_by(project_environment_id: deployment.project_environment_id)
        entry.assign_attributes(project: deployment.project, workspace: deployment.workspace, expected_version: target['expected_version'],
          observed_version: row['observed_version'], observed_at: row['observed_at'], source: row['source'], updated_by: actor,
          verified_at: Time.current, verified_by: actor)
        entry.save!
      end
      deployment.update!(verified_at: Time.current, verified_by: actor)
      deployment
    end
  end
end
