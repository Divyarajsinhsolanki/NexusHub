module TaskProjectAccess
  extend ActiveSupport::Concern

  private

  def authorize_task_attributes!(attributes, task: nil)
    Tasks::Access.authorize_attributes!(current_user, attributes, task: task)
  end
end
