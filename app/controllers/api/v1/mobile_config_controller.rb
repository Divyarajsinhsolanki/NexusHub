class Api::V1::MobileConfigController < Api::V1::BaseController
  skip_before_action :authenticate_user!
  skip_before_action :enforce_demo_read_only!

  FEATURES = %w[
    today work projects issues calendar posts teams skills learning_goals people chat calls notifications
    knowledge vault pdf keka profile settings admin portfolio_admin
  ].freeze

  def show
    render_data(
      {
        app_name: "Nexus Hub",
        minimum_version: ENV.fetch("MOBILE_MINIMUM_VERSION", "1.0.0"),
        recommended_version: ENV.fetch("MOBILE_RECOMMENDED_VERSION", "1.0.0"),
        maintenance: ActiveModel::Type::Boolean.new.cast(ENV["MOBILE_MAINTENANCE_MODE"]),
        features: FEATURES.index_with { true },
        web_url: ENV["FRONTEND_URL"].presence || request.base_url
      }
    )
  end
end
