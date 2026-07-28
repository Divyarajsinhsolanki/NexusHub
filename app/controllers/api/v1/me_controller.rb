class Api::V1::MeController < Api::V1::BaseController
  def show
    render_data(serialize_user(current_user))
  end
end
