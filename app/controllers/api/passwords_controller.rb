class Api::PasswordsController < Api::BaseController
  skip_before_action :authenticate_user!, only: [:create, :update]

  # POST /api/password/forgot
  def create
    email = params.dig(:password, :email).to_s.strip.downcase
    Rails.logger.info("[PasswordResetEmail] password reset requested")

    if email.present? && (user = User.find_by(email: email))
      Rails.logger.info("[PasswordResetEmail] password reset user found")
      PasswordResetEmailDelivery.call(user: user)
    else
      Rails.logger.info("[PasswordResetEmail] password reset user not found")
    end

    render json: { message: "If that email exists, a reset link is on its way." }
  end

  # POST /api/password/reset
  def update
    password_params = params.require(:password).permit(:token, :password, :password_confirmation)

    user = User.reset_password_by_token(
      reset_password_token: password_params[:token],
      password: password_params[:password],
      password_confirmation: password_params[:password_confirmation]
    )

    if user.errors.empty?
      render json: { message: "Password updated successfully." }
    else
      render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # PATCH /api/password/change
  def change
    password_params = params.require(:password).permit(:current_password, :password, :password_confirmation)

    unless current_user.valid_password?(password_params[:current_password].to_s)
      return render json: { errors: ["Current password is incorrect."] }, status: :unprocessable_entity
    end

    if current_user.update(
      password: password_params[:password],
      password_confirmation: password_params[:password_confirmation]
    )
      render json: { message: "Password changed successfully." }
    else
      render json: { errors: current_user.errors.full_messages }, status: :unprocessable_entity
    end
  end

end
