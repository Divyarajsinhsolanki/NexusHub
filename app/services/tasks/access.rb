module Tasks
  class Access
    class InvalidAssignment < StandardError; end
    def self.authorize_attributes!(user, attributes, task: nil)
      task&.authorize_edit!(user)
      if (attributes[:type].presence || task&.type) == 'general'
        attributes[:project_id] = nil
        attributes[:sprint_id] = nil
        return attributes
      end

      sprint_id = attributes.key?(:sprint_id) ? attributes[:sprint_id].presence : task&.sprint_id
      project_id = attributes.key?(:project_id) ? attributes[:project_id].presence : task&.project_id
      if sprint_id
        sprint = Sprint.where(project_id: Project.accessible_to(user).select(:id)).find(sprint_id)
        if project_id && project_id.to_i != sprint.project_id
          raise InvalidAssignment, 'Sprint must belong to the selected project.'
        end
        project_id ||= sprint.project_id
        attributes[:project_id] = project_id
      end
      Project.accessible_to(user).find(project_id).authorize_edit!(user) if project_id
      attributes
    end
  end
end
