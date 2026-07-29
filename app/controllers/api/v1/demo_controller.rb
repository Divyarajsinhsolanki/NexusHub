class Api::V1::DemoController < Api::V1::BaseController
  include PortfolioSeedImageUrls

  before_action :require_portfolio_enabled!

  def manifest
    return render_error(code: "forbidden", message: "The guided tour requires a demo session.", status: :forbidden) unless current_user.demo_account?

    project = Project.order(:id).first
    features = PortfolioProject.published.ordered.first
      &.portfolio_features
      &.published
      &.tour_ordered
      &.to_a || []

    groups = Api::DemoController::GROUPS.each_with_index.map do |group, index|
      feature = features[index]
      group.merge(
        route: mobile_route(group[:key], project),
        step: index + 1,
        review_notes: feature&.review_notes,
        screenshot_url: portfolio_attachment_url(feature&.screenshot)
      )
    end

    render_data(
      {
        workspace: { id: current_user.workspace_id, name: current_user.workspace.name },
        duration: "5 minutes",
        total_steps: groups.length,
        recommended_route: groups.first&.dig(:route),
        groups: groups
      }
    )
  end

  private

  def mobile_route(key, project)
    case key
    when "delivery" then project ? "/projects/#{project.id}" : "/projects"
    when "focus" then "/more/momentum"
    when "collaboration" then "/inbox"
    when "knowledge" then "/more/knowledge"
    when "documents" then "/more/pdf"
    else "/more/demo"
    end
  end
end
