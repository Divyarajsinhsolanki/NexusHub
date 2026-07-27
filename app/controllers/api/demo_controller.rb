class Api::DemoController < Api::BaseController
  include PortfolioSeedImageUrls

  before_action :require_portfolio_enabled!

  GROUPS = [
    {
      key: "delivery",
      title: "Project Delivery",
      summary: "Projects, sprints, Kanban planning, statistics, issues, sheets, and project vaults.",
      route: "/projects"
    },
    {
      key: "focus",
      title: "Planning and Focus",
      summary: "Calendar planning, daily momentum, work logs, priorities, notes, and Pomodoro sessions.",
      route: "/momentum"
    },
    {
      key: "collaboration",
      title: "Team Collaboration",
      summary: "Posts, teams, skills, departments, real-time chat, mentions, and notifications.",
      route: "/posts"
    },
    {
      key: "knowledge",
      title: "Knowledge and Learning",
      summary: "Knowledge cards, bookmarks, learning goals, external signals, and 3D exploration.",
      route: "/knowledge"
    },
    {
      key: "documents",
      title: "PDF Workflows",
      summary: "Editing, annotation, signing, watermarking, merging, splitting, protection, and export.",
      route: "/pdf-master"
    },
    {
      key: "platform",
      title: "Platform Engineering",
      summary: "Rails APIs, React UI, authorization, jobs, integrations, performance, and deployment.",
      route: "/demo#architecture"
    }
  ].freeze

  def manifest
    return head :forbidden unless current_user.demo_account?

    project = Project.order(:id).first
    portfolio_features = PortfolioProject.published.ordered.first
      &.portfolio_features
      &.published
      &.tour_ordered
      &.to_a || []

    groups = GROUPS.each_with_index.map do |group, index|
      feature = portfolio_features[index]
      route = group[:route]
      route = feature.demo_path if feature&.demo_path.present?
      route = "/projects/#{project.id}/dashboard" if group[:key] == "delivery" && project
      group.merge(
        route: route,
        step: index + 1,
        review_notes: feature&.review_notes,
        screenshot_url: attachment_path(feature&.screenshot)
      )
    end

    groups.each_with_index do |group, index|
      group[:previous_route] = index.zero? ? "/demo" : groups[index - 1][:route]
      group[:next_route] = index == groups.length - 1 ? "/demo#architecture" : groups[index + 1][:route]
    end

    render json: {
      workspace: {
        id: current_user.workspace_id,
        name: current_user.workspace.name
      },
      duration: "5 minutes",
      total_steps: groups.length,
      recommended_start: groups.first&.dig(:route),
      groups: groups
    }
  end

  private

  def attachment_path(attachment)
    portfolio_attachment_url(attachment)
  end
end
