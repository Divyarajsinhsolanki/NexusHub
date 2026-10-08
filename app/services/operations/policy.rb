module Operations
  class Policy
    attr_reader :project, :user

    def initialize(project, user)
      @project, @user = project, user
    end

    def membership
      return unless user && project.workspace_id == user.workspace_id

      @membership ||= project.project_users.find_by(user_id: user.id, status: "active")
    end

    def read?
      membership.present?
    end

    def edit?
      read? && membership.role != "viewer" && !user.demo_account?
    end

    def authorize_read!
      raise ActiveRecord::RecordNotFound unless read?
    end

    def authorize_edit!
      authorize_read!
      raise Forbidden, "Your project role has read-only access." unless edit?
    end
  end
end
