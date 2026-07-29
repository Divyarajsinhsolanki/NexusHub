class ErrorNotificationMailer < ApplicationMailer
  def self.recipient
    [
      ENV["ERROR_NOTIFICATION_EMAIL"],
      ENV["SMTP_USERNAME"],
      Devise.mailer_sender
    ].map(&:presence).compact.find { |value| value.include?("@") }
  end

  def self.enabled?
    Rails.env.production? && recipient.present?
  end

  def exception_report(exception_class:, message:, backtrace:, request_context:)
    @exception_class = exception_class
    @message = message
    @backtrace = Array(backtrace).first(30)
    @request_context = request_context || {}

    mail(
      to: self.class.recipient,
      subject: "[Nexus Hub] #{exception_class} on #{@request_context[:path] || 'request'}"
    )
  end
end
