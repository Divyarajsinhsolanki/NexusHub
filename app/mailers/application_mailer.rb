class ApplicationMailer < ActionMailer::Base
  default from: -> { ENV["MAILER_SENDER"].presence || ENV["SMTP_USERNAME"].presence || "divyaraj@atharvasystem.com" }
  helper MailerHelper
  layout "mailer"
  before_action :attach_brand_icon

  private

  def attach_brand_icon
    attachments.inline["nexushub-icon.png"] = {
      mime_type: "image/png",
      content: File.binread(Rails.root.join("app/javascript/images/sparkle.png"))
    }
  end
end
