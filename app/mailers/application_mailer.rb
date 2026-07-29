class ApplicationMailer < ActionMailer::Base
  default from: -> { ENV["MAILER_SENDER"].presence || ENV["SMTP_USERNAME"].presence || "divyaraj@atharvasystem.com" }
  layout "mailer"
end
