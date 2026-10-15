class Api::KekaController < Api::BaseController
  def credentials
    permitted = params.require(:keka).permit(:base_url, :api_key, :employee_id)
    Keka::Client.validate_base_url!(permitted[:base_url])
    if current_user.keka_secret_ciphertext.present? && permitted[:base_url].to_s.strip.chomp('/') != current_user.keka_base_url.to_s.strip.chomp('/') && permitted[:api_key].blank?
      return render json: { error: "Re-enter the API key when changing the Keka destination." }, status: :unprocessable_entity
    end
    attributes = { keka_base_url: permitted[:base_url], keka_employee_id: permitted[:employee_id] }
    attributes[:keka_api_key] = permitted[:api_key] if permitted[:api_key].present?
    current_user.update!(attributes)

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
    user.keka_payload.merge(data: Integrations::Redactor.call(payload || user.keka_profile_data,
      known_secrets: [user.safe_keka_api_key]))
  end
end
