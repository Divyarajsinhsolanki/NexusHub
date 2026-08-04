class Api::V1::PasswordsController < Api::V1::BaseController
  skip_before_action :authenticate_user!, only: [:forgot, :reset]
  skip_before_action :enforce_demo_read_only!, only: [:forgot, :reset]

  def forgot
    email = params.require(:email).to_s.strip.downcase
    if email.present? && (user = User.find_by(email: email))
      send_reset_instructions(user, email)
    end

    render_data({ accepted: true })
  end

  def reset
    user = User.reset_password_by_token(
      reset_password_token: params.require(:reset_password_token),
      password: params.require(:password),
      password_confirmation: params.require(:password_confirmation)
    )

    return render_validation_error(user) if user.errors.any?

    MobileSession.where(user: user).active.find_each(&:revoke!)
    render_data({ password_reset: true })
  end

  def change
    password_params = params.require(:password).permit(:current_password, :password, :password_confirmation)

    unless current_user.valid_password?(password_params[:current_password].to_s)
      return render_error(
        code: "invalid_current_password",
        message: "Current password is incorrect.",
        status: :unprocessable_entity
      )
    end

    unless current_user.update(
      password: password_params[:password],
      password_confirmation: password_params[:password_confirmation]
    )
      return render_validation_error(current_user)
    end

    MobileSession.where(user: current_user).active.where.not(id: current_mobile_session&.id).find_each(&:revoke!)
    render_data({ password_changed: true })
  end

  private

  def send_reset_instructions(user, email)
    user.send_reset_password_instructions
  rescue StandardError => error
    AppEventLogger.error(
      :application_errors,
      source: "#{self.class.name}#forgot",
      message: "Mobile password reset email failed",
      exception: error,
      payload: { email: email }
    )
    Rails.error.report(error, handled: true, context: { controller: self.class.name, action: "password_forgot", email: email })
  end
end
