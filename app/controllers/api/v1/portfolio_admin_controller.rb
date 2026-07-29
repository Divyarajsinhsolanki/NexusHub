class Api::V1::PortfolioAdminController < Api::V1::BaseController
  include PortfolioSeedImageUrls

  before_action :require_portfolio_enabled!
  before_action :authorize_site_admin!
  skip_before_action :enforce_demo_read_only!
  rescue_from ActiveRecord::RecordInvalid, with: :render_record_invalid

  def show
    render_portfolio
  end

  def update_profile
    profile = PortfolioProfile.first_or_initialize
    profile.assign_attributes(profile_params)
    attach_file(profile.avatar, params.dig(:portfolio_profile, :avatar))
    attach_file(profile.resume, params.dig(:portfolio_profile, :resume))
    profile.save!
    render_data(serialize_profile(profile))
  end

  def create_project
    project = PortfolioProject.new(project_params)
    attach_file(project.cover_image, params.dig(:portfolio_project, :cover_image))
    project.save!
    render_data(serialize_project(project), status: :created)
  end

  def update_project
    project = PortfolioProject.find(params[:id])
    project.assign_attributes(project_params)
    attach_file(project.cover_image, params.dig(:portfolio_project, :cover_image))
    project.save!
    render_data(serialize_project(project))
  end

  def destroy_project
    PortfolioProject.find(params[:id]).destroy!
    render_data({ deleted: true })
  end

  def create_feature
    feature = PortfolioProject.find(params[:project_id]).portfolio_features.new(feature_params)
    attach_file(feature.screenshot, params.dig(:portfolio_feature, :screenshot))
    feature.save!
    render_data(serialize_feature(feature), status: :created)
  end

  def update_feature
    feature = PortfolioFeature.find(params[:id])
    feature.assign_attributes(feature_params)
    attach_file(feature.screenshot, params.dig(:portfolio_feature, :screenshot))
    feature.save!
    render_data(serialize_feature(feature))
  end

  def destroy_feature
    PortfolioFeature.find(params[:id]).destroy!
    render_data({ deleted: true })
  end

  def update_order
    PortfolioProject.transaction do
      Array(params[:projects]).each do |entry|
        PortfolioProject.find(entry.require(:id)).update!(position: entry.require(:position))
      end
      Array(params[:features]).each do |entry|
        PortfolioFeature.find(entry.require(:id)).update!(
          position: entry.require(:position),
          tour_position: entry[:tour_position].presence || entry.require(:position)
        )
      end
    end
    render_portfolio
  end

  private

  def render_portfolio
    render_data(
      {
        profile: serialize_profile(PortfolioProfile.first),
        projects: PortfolioProject.ordered.includes(:portfolio_features).map { |project| serialize_project(project) }
      }
    )
  end

  def authorize_site_admin!
    render_error(code: "forbidden", message: "Site administrator access is required.", status: :forbidden) unless current_user&.site_admin?
  end

  def profile_params
    params.require(:portfolio_profile).permit(
      :full_name, :headline, :location, :summary, :published,
      skills: [], metrics: [], architecture: [], engineering_highlights: [], social_links: {}
    )
  end

  def project_params
    params.require(:portfolio_project).permit(
      :title, :slug, :tagline, :summary, :description, :repository_url, :live_url,
      :position, :featured, :published, stack: [], metrics: [], engineering_highlights: [],
      case_study: {}, seo: {}
    )
  end

  def feature_params
    params.require(:portfolio_feature).permit(
      :category, :title, :summary, :demo_path, :alt_text, :position, :tour_position,
      :review_notes, :published
    )
  end

  def attach_file(attachment, file)
    attachment.attach(file) if file.present?
  end

  def serialize_profile(profile)
    return unless profile

    profile.as_json.merge(
      avatar_url: portfolio_attachment_url(profile.avatar),
      resume_url: portfolio_attachment_url(profile.resume, disposition: "attachment")
    )
  end

  def serialize_project(project)
    project.as_json.merge(
      cover_image_url: portfolio_attachment_url(project.cover_image),
      features: project.portfolio_features.ordered.map { |feature| serialize_feature(feature) }
    )
  end

  def serialize_feature(feature)
    feature.as_json.merge(screenshot_url: portfolio_attachment_url(feature.screenshot))
  end

  def render_record_invalid(error)
    render_validation_error(error.record)
  end
end
