require "test_helper"

class PostmarkConfigurationTest < ActiveSupport::TestCase
  class ProbeMailer < ApplicationMailer
    def probe
      mail(to: "recipient@example.test", subject: "Delivery probe", body: "Nexus Hub email delivery test")
    end
  end

  test "postmark delivery method is registered" do
    assert ActionMailer::Base.delivery_methods.key?(:postmark)
  end

  test "application mailers inherit the configured sender" do
    original_sender = ENV["MAILER_SENDER"]
    ENV["MAILER_SENDER"] = "Nexus Hub <divyaraj@atharvasystem.com>"

    assert_equal [ "divyaraj@atharvasystem.com" ], ProbeMailer.probe.from

    [ CalendarEventReminderMailer, IssueMailer, KnowledgeBookmarkMailer ].each do |mailer|
      assert_equal ApplicationMailer.default_params[:from], mailer.default_params[:from]
    end
  ensure
    ENV["MAILER_SENDER"] = original_sender
  end
end
