require "test_helper"

class GenerationSettingsTest < ActiveSupport::TestCase
  test "defaults preserve the working GPT OSS configuration" do
    settings = Knowledge::GenerationSettings.new(env: {})
    assert_equal ["responses", "mantle", "openai.gpt-oss-120b", "ap-south-1", 4000, "low"],
      [settings.api, settings.endpoint, settings.model_id, settings.region, settings.max_tokens, settings.reasoning_effort]
  end

  test "switches to Converse with explicit model and region" do
    settings = Knowledge::GenerationSettings.new(env: { "DAILY_KNOWLEDGE_API" => "converse",
      "DAILY_KNOWLEDGE_MODEL_ID" => "amazon.nova-micro-v1:0", "DAILY_KNOWLEDGE_REGION" => "us-east-1" })
    Aws::BedrockRuntime::Client.stub(:new, ->(**options) { assert_equal "us-east-1", options[:region]; :client }) do
      assert_equal :client, settings.client
    end
    assert_equal 2000, settings.max_tokens
  end

  test "passes endpoint and optional reasoning into Responses client" do
    settings = Knowledge::GenerationSettings.new(env: { "DAILY_KNOWLEDGE_ENDPOINT" => "runtime",
      "DAILY_KNOWLEDGE_MODEL_ID" => "some-supported-model", "DAILY_KNOWLEDGE_REASONING_EFFORT" => "omit",
      "DAILY_KNOWLEDGE_MAX_TOKENS" => "3000" })
    Knowledge::BedrockResponsesClient.stub(:new, ->(**options) { assert_equal "runtime", options[:endpoint]; assert_equal "omit", options[:reasoning_effort]; :client }) do
      assert_equal :client, settings.client
    end
    assert_equal 3000, settings.max_tokens
  end

  test "rejects invalid settings before publishing" do
    { "DAILY_KNOWLEDGE_API" => "bad", "DAILY_KNOWLEDGE_ENDPOINT" => "https://external.example",
      "DAILY_KNOWLEDGE_MODEL_ID" => " ", "DAILY_KNOWLEDGE_REGION" => "../bad",
      "DAILY_KNOWLEDGE_MAX_TOKENS" => "9000", "DAILY_KNOWLEDGE_REASONING_EFFORT" => "bad" }.each do |key, value|
      assert_raises(ArgumentError) { Knowledge::GenerationSettings.new(env: { key => value }) }
    end
    assert_raises(ArgumentError) { Knowledge::GenerationSettings.new(env: { "DAILY_KNOWLEDGE_ENDPOINT" => "runtime" }) }
  end
end
