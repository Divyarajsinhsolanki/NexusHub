class Api::V1::PasswordsController < Api::V1::BaseController
  skip_before_action :authenticate_user!
  skip_before_action :enforce_demo_read_only!

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

  private

  def send_reset_instructions(user, email)
    user.send_reset_password_instructions
  rescue StandardError => error
    send_exception_notification(error)
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
