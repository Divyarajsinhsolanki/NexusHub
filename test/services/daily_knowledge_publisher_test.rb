require "test_helper"
require "aws-sdk-bedrockruntime"

class DailyKnowledgePublisherTest < ActiveSupport::TestCase
  setup do
    @workspace = Workspace.create!(name: "Daily knowledge", slug: "daily-knowledge-test", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "daily-owner@example.test")
    @old_email = ENV["DAILY_KNOWLEDGE_OWNER_EMAIL"]
    ENV["DAILY_KNOWLEDGE_OWNER_EMAIL"] = @user.email
    @client = Aws::BedrockRuntime::Client.new(region: "us-east-1", stub_responses: true)
    @items = 4.times.map { |i| { title: "Technical concept number #{i}", summary: "A practical tip.", body: "Review and test this example before using it." } }
    stub_items(@items)
  end

  teardown do
    ENV["DAILY_KNOWLEDGE_OWNER_EMAIL"] = @old_email
  end

  test "publishes exactly three tips and one post shared within workspace and is idempotent" do
    teammate = create_test_user(workspace: @workspace, email: "teammate@example.test")
    outsider = create_test_user(workspace: Workspace.create!(name: "Other", slug: "other-daily", kind: "private"), email: "outsider@example.test")
    publisher = Knowledge::DailyPublisher.new(workspace: @workspace, client: @client)
    date = Date.new(2026, 10, 10)
    first = publisher.publish(date: date)
    assert_equal first.id, publisher.publish(date: date).id
    items = KnowledgeItem.in_workspace(@workspace).where(knowledge_prompt_run_id: first.id)
    alerts = Notification.unscoped.where(action: "daily_knowledge_published", workspace_id: @workspace.id)
    assert_equal [@user.id, teammate.id].sort, alerts.pluck(:recipient_id).sort
    assert_not alerts.exists?(recipient_id: outsider.id)
    assert alerts.all? { |alert| KnowledgeItem.unscoped.find(alert.notifiable_id).item_type == "article" && alert.metadata["daily_date"] == date.iso8601 }
    assert_equal 4, items.count
    assert_equal 3, items.where(item_type: "fact").count
    assert_equal 1, items.where(item_type: "article").count
    assert items.all? { |item| item.payload["workspace_shared"] }
    assert_equal 1, @client.api_requests.count
    assert_equal 2000, @client.api_requests.first[:params][:inference_config][:max_tokens]
  end

  test "new day archives only older daily content" do
    publisher = Knowledge::DailyPublisher.new(workspace: @workspace, client: @client)
    publisher.publish(date: Date.new(2026, 10, 10))
    Current.set(workspace: @workspace, user: @user) do
      private_run = @user.knowledge_prompt_runs.create!(prompt: "Personal")
      personal = @user.knowledge_items.create!(knowledge_prompt_run: private_run, title: "My personal note")
      stub_items(@items.map { |item| item.merge(title: item[:title] + " new") })
      publisher.publish(date: Date.new(2026, 10, 11))
      assert_equal 4, KnowledgeItem.archived.count
      assert_equal 5, KnowledgeItem.active.count
      assert personal.reload.active?
    end
  end

  test "invalid response rolls back without archiving existing cards" do
    publisher = Knowledge::DailyPublisher.new(workspace: @workspace, client: @client)
    publisher.publish(date: Date.new(2026, 10, 10))
    stub_items(@items.first(2))
    assert_no_difference "Notification.unscoped.count" do
      assert_raises(ArgumentError) { publisher.publish(date: Date.new(2026, 10, 11)) }
    end
    assert_equal 4, KnowledgeItem.in_workspace(@workspace).active.count
    assert_equal 1, KnowledgePromptRun.in_workspace(@workspace).count
  end

  test "duplicate topics are rejected" do
    stub_items([@items.first] * 4)
    assert_raises(ArgumentError) { Knowledge::DailyPublisher.new(workspace: @workspace, client: @client).publish }
    assert_empty KnowledgeItem.in_workspace(@workspace)
  end

  private

  def stub_items(items)
    @client.stub_responses(:converse, output: { message: { role: "assistant", content: [{ text: { items: items }.to_json }] } }, usage: { input_tokens: 200, output_tokens: 600, total_tokens: 800 }, stop_reason: "end_turn", metrics: { latency_ms: 100 })
  end
end
