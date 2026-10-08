class OperationScheduleMaterializeJob < ApplicationJob
  queue_as :default

  def perform
    ProjectDeploymentSeries.unscoped.where(active: true).find_each do |series|
      Current.set(workspace: series.workspace) do
        series.project.with_lock do
          series.reload
          before_count = series.project_deployments.count
          Operations::Schedules.materialize!(series)
          if series.project_deployments.count != before_count
            series.project.increment!(:operations_revision)
          end
        end
      end
    rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotFound => error
      # A removed owner can invalidate one series. Keep other projects rolling
      # forward; log only identifiers and class, never schedule contents.
      Rails.logger.warn("Operations schedule #{series.id}: #{error.class.name}")
    end
  end
end
