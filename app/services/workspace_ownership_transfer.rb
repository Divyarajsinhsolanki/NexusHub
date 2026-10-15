class WorkspaceOwnershipTransfer
  class InvalidRequest < StandardError; end
  def self.required?(user)
    user.membership_for&.role_names&.include?("owner") || user.site_admin? ||
      [Project, Team, ProjectDeployment, ProjectDeploymentSeries].any? { |model| model.unscoped.where(workspace_id: user.workspace_id, owner_id: user.id).exists? } ||
      Department.unscoped.where(workspace_id: user.workspace_id, manager_id: user.id).exists? ||
      ProjectOperationItem.unscoped.where(workspace_id: user.workspace_id).where("details ->> 'owner_id' = ?", user.id.to_s).exists? ||
      Conversation.unscoped.where(workspace_id: user.workspace_id, creator_id: user.id, conversation_type: "group").exists?
  end

  def self.transfer!(user, successor_id:, allow_platform_transfer: false)
    Current.set(workspace: user.workspace) do
      user.workspace.with_lock do
        successor = user.workspace.users.lock.find_by(id: successor_id, status: 'active', deleted_at: nil, demo_account: false)
        raise InvalidRequest, 'Choose an active workspace member.' unless successor&.workspace_access? && successor.confirmed?
        raise InvalidRequest, 'Choose another active member of your workspace to take ownership.' unless successor && successor.id != user.id
        raise InvalidRequest, 'The successor also has a pending deletion.' if AccountDeletionRequest.where(user: successor, status: 'scheduled').exists?
        if user.site_admin?
          raise InvalidRequest, 'Platform administrators require a separate privileged transfer.' unless allow_platform_transfer
          raise InvalidRequest, 'Assign another site administrator before deleting your account.' unless User.where(site_admin: true, deleted_at: nil).where.not(id: user.id).exists?
        end
        if user.membership_for&.role_names&.include?("owner")
          UserRole.find_or_create_by!(user: successor, role: Role.find_by!(name: 'owner'), workspace: user.workspace)
          UserRole.where(user: user, role: Role.find_by!(name: 'owner')).destroy_all
          user.instance_variable_set(:@role_names, nil)
        end
        owned_projects = Project.unscoped.where(workspace_id: user.workspace_id, owner_id: user.id).pluck(:id)
        operations_projects = ProjectDeployment.unscoped.where(workspace_id: user.workspace_id, owner_id: user.id).pluck(:project_id) +
          ProjectDeploymentSeries.unscoped.where(workspace_id: user.workspace_id, owner_id: user.id).pluck(:project_id) +
          ProjectOperationItem.unscoped.where(workspace_id: user.workspace_id).where("details ->> 'owner_id' = ?", user.id.to_s).pluck(:project_id)
        (operations_projects.uniq - owned_projects).each do |project_id|
          unless ProjectUser.where(project_id: project_id, user_id: successor.id, status: 'active').exists?
            raise InvalidRequest, 'The successor must already be an active member of each operational project you do not own.'
          end
        end
        owned_projects.each do |project_id|
          membership = ProjectUser.find_or_initialize_by(project_id: project_id, user_id: successor.id)
          membership.assign_attributes(workspace: user.workspace, role: 'owner', status: 'active')
          membership.save!
        end
        Team.unscoped.where(workspace_id: user.workspace_id, owner_id: user.id).find_each do |team|
          membership = TeamUser.find_or_initialize_by(team: team, user: successor, workspace: user.workspace)
          membership.assign_attributes(role: 'admin', status: 'accepted')
          membership.save!
        end
        [Project, Team, ProjectDeployment, ProjectDeploymentSeries].each do |model|
          model.unscoped.where(workspace_id: user.workspace_id, owner_id: user.id).update_all(owner_id: successor.id, updated_at: Time.current)
        end
        Department.unscoped.where(workspace_id: user.workspace_id, manager_id: user.id).update_all(manager_id: successor.id)
        ProjectOperationItem.unscoped.where(workspace_id: user.workspace_id).where("details ->> 'owner_id' = ?", user.id.to_s).find_each do |item|
          item.update!(details: item.details.merge('owner_id' => successor.id))
        end
        Conversation.unscoped.where(workspace_id: user.workspace_id, creator_id: user.id, conversation_type: 'group').find_each do |conversation|
          unless ConversationParticipant.unscoped.exists?(conversation_id: conversation.id, user_id: successor.id, removed_at: nil)
            raise InvalidRequest, 'The successor must already be a member of every group chat you own. Direct chats are never transferred.'
          end
          conversation.update!(creator: successor)
        end
        # Administrative status is retained only until final removal.
        user.update_column(:site_admin, false) if user.site_admin?
      end
    end
  end
end
