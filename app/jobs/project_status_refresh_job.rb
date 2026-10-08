class ProjectStatusRefreshJob < ApplicationJob
  queue_as :default

  def perform
    Project.refresh_date_statuses!
  end
end
