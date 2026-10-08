module Operations
  # Vault and Operations share environment identities and the same audit trail.
  class Environments
    def self.call(project:, actor:, action:, attributes: {}, environment: nil, revision: nil, reason: nil)
      Mutation.new(project: project, actor: actor, revision: revision, require_revision: false)
        .run(event: "environment_#{action}", reason: reason) do |mutation|
          record = environment || project.project_environments.build
          case action.to_s
          when 'create', 'update'
            record.update!(attributes.slice(:name, :url, :description))
          when 'delete'
            if referenced?(project, record)
              raise Error, 'Remove or reassign the environment’s configuration, licences, and deployments before deleting it.'
            end
            record.destroy!
          else
            raise Error, 'Unknown environment action'
          end
          mutation.audit!(action: "environment_#{action}", environment: record, fields: attributes.keys.map(&:to_s))
          { environment: record.as_json(only: %i[id name url description project_id created_at updated_at]) }
        end
    end

    def self.referenced?(project, environment)
      ProjectOperationEntry.where(project_id: project.id, project_environment_id: environment.id).exists? ||
        ProjectDeployment.where(project_id: project.id, project_environment_id: environment.id).exists? ||
        ProjectDeploymentSeries.where(project_id: project.id, project_environment_id: environment.id).exists? ||
        project.project_operation_items.where(kind: 'license').any? { |item| Array(item.details['environment_ids']).map(&:to_i).include?(environment.id) }
    end
  end
end
