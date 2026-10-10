class Api::KekaController < Api::BaseController
  def credentials
    permitted = params.require(:keka).permit(:base_url, :api_key, :employee_id)
    Keka::Client.validate_base_url!(permitted[:base_url])
    current_user.update!(
      keka_base_url: permitted[:base_url],
      keka_api_key: permitted[:api_key],
      keka_employee_id: permitted[:employee_id]
    )

    payload = params[:sync].present? ? Keka::SyncService.new(current_user).call : current_user.keka_profile_data

    render json: { message: "Keka credentials saved", keka: keka_payload(current_user, payload: payload) }
  rescue Keka::Client::UnsafeUrl => e
    render json: { error: e.message }, status: :unprocessable_entity
  rescue ActiveRecord::RecordInvalid => e
    render json: { error: e.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
  rescue Keka::SyncService::SyncError => e
    render json: { error: e.message, keka: keka_payload(current_user) }, status: :unprocessable_entity
  end

  def profile
    render json: { keka: keka_payload(current_user) }
  end

  def refresh
    payload = Keka::SyncService.new(current_user).call
    render json: { message: "Keka data refreshed", keka: keka_payload(current_user, payload: payload) }
  rescue Keka::SyncService::SyncError => e
    render json: { error: e.message, keka: keka_payload(current_user) }, status: :unprocessable_entity
  end

  private

  def keka_payload(user, payload: nil)
    user.keka_payload.merge(data: payload || user.keka_profile_data)
  end
end
