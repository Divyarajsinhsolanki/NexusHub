class Api::V1::WorkOptionsController < Api::V1::BaseController
  def show
    render_data(
      {
        categories: WorkCategory.order(:name).map { |category| serialize_work_option(category) },
        priorities: WorkPriority.order(:name).map { |priority| serialize_work_option(priority) },
        tags: WorkTag.order(:name).map { |tag| { id: tag.id, name: tag.name } }
      }
    )
  end
end
