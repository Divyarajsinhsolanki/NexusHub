class AccountLifecycleMailer < ApplicationMailer
  def verification(user, encrypted_code)
    key = Rails.application.key_generator.generate_key('account-deletion-code', 32)
    code = ActiveSupport::MessageEncryptor.new(key).decrypt_and_verify(encrypted_code)
    mail(to: user.email, subject: 'Verify your account deletion request') do |format|
      format.text { render plain: "Your account deletion verification code is #{code}. It expires in 15 minutes. Do not share this code.\n\nAfter confirmation, you have seven days to cancel from Settings on web or mobile. Ownership transfers take effect immediately and are not undone by cancelling deletion.\n\nIf you did not request this, ignore this email; your account will not be deleted." }
    end
  end
end
