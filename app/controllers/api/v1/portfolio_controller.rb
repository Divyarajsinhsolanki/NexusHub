class Api::V1::PortfolioController < Api::V1::BaseController
  include PortfolioSeedImageUrls

  skip_before_action :authenticate_user!
  skip_before_action :enforce_demo_read_only!
  before_action :require_portfolio_enabled!

  def show
    profile = PortfolioProfile.published.includes(avatar_attachment: :blob, resume_attachment: :blob).first
    projects = PortfolioProject.published.ordered.includes(
      { cover_image_attachment: :blob },
      portfolio_features: { screenshot_attachment: :blob }
    )

    render_data(
      {
        profile: profile && serialize_profile(profile),
        projects: projects.map { |project| serialize_project(project) }
      }
    )
  end

  private

  def serialize_profile(profile)
    profile.as_json(
      only: %i[full_name headline location summary skills metrics social_links architecture engineering_highlights]
    ).merge(
      avatar_url: portfolio_attachment_url(profile.avatar),
      resume_url: portfolio_attachment_url(profile.resume, disposition: "attachment")
    )
  end

  def serialize_project(project)
    project.as_json(
      only: %i[id title slug tagline summary description stack metrics engineering_highlights case_study repository_url live_url featured]
    ).merge(
      cover_image_url: portfolio_attachment_url(project.cover_image),
      features: project.portfolio_features.published.tour_ordered.map { |feature| serialize_feature(feature) }
    )
  end

  def serialize_feature(feature)
    feature.as_json(
      only: %i[id category title summary demo_path alt_text position tour_position]
    ).merge(screenshot_url: portfolio_attachment_url(feature.screenshot))
  end
end
