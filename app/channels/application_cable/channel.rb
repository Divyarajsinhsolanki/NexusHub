module ApplicationCable
  class Channel < ActionCable::Channel::Base
    set_callback :subscribe, :around, :with_workspace_context

    def perform_action(data)
      with_workspace_context { super }
    end

    private

    def with_workspace_context
      membership = current_user.membership_for(current_workspace)
      unless current_user.workspace_access?(current_workspace) && membership&.active?
        reject
        return
      end
      Current.set(user: current_user, workspace: current_workspace, membership: membership) { yield }
    end
  end
end
