class Api::V1::PasswordsController < Api::V1::BaseController
  skip_before_action :authenticate_user!
  skip_before_action :enforce_demo_read_only!

  def forgot
    User.send_reset_password_instructions(email: params.require(:email).to_s.strip.downcase)
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
end
