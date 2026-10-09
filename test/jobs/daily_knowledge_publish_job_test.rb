require "test_helper"
require "minitest/mock"

class DailyKnowledgePublishJobTest < ActiveJob::TestCase
  setup do
    @previous = ENV["DAILY_KNOWLEDGE_ENABLED"]
  end
  teardown do
    ENV["DAILY_KNOWLEDGE_ENABLED"] = @previous
  end

  test "disabled publisher does not access a workspace" do
    ENV["DAILY_KNOWLEDGE_ENABLED"] = "false"
    Knowledge::DailyPublisher.stub(:workspace, -> { flunk "must not look up workspace" }) do
      assert_nil DailyKnowledgePublishJob.perform_now
    end
  end

  test "startup before nine IST does not publish early" do
    ENV["DAILY_KNOWLEDGE_ENABLED"] = "true"
    travel_to Time.utc(2026, 10, 10, 3, 29) do
      Knowledge::DailyPublisher.stub(:workspace, -> { flunk "must wait until nine IST" }) do
        assert_nil DailyKnowledgePublishJob.perform_now
      end
    end
  end
  test "nine IST publishes for the current India date" do
    ENV["DAILY_KNOWLEDGE_ENABLED"] = "true"
    publisher = Object.new
    published_date = nil
    publisher.define_singleton_method(:publish) { |date:| published_date = date }
    travel_to Time.utc(2026, 10, 10, 3, 30) do
      Knowledge::DailyPublisher.stub(:workspace, :selected_workspace) do
        Knowledge::DailyPublisher.stub(:new, publisher) { DailyKnowledgePublishJob.perform_now }
      end
    end
    assert_equal Date.new(2026, 10, 10), published_date
  end
end
