class Api::V1::PasswordsController < Api::V1::BaseController
  skip_before_action :authenticate_user!, only: [:forgot, :reset]
  skip_before_action :enforce_demo_read_only!, only: [:forgot, :reset]

  def forgot
    email = params.require(:email).to_s.strip.downcase
    Rails.logger.info("[PasswordResetEmail] password reset requested")

    if email.present? && (user = User.find_by(email: email))
      Rails.logger.info("[PasswordResetEmail] password reset user found")
      PasswordResetEmailDelivery.call(user: user)
    else
      Rails.logger.info("[PasswordResetEmail] password reset user not found")
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

end
