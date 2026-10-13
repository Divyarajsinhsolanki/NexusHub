require "test_helper"

class BedrockResponsesClientTest < ActiveSupport::TestCase
  setup do
    @requests = []
    @document = { status: "completed", output: [
      { type: "reasoning", summary: [] },
      { type: "message", content: [{ type: "output_text", text: '{"items":[]}' }] }
    ], usage: { input_tokens: 10, output_tokens: 20 } }
    @response = Net::HTTPOK.new("1.1", "200", "OK")
    connection = Object.new
    requests = @requests
    response = @response
    connection.define_singleton_method(:request) { |request| requests << request; response }
    @http = Object.new
    @http.define_singleton_method(:start) { |*args, **options, &block| block.call(connection) }
    @client = Knowledge::BedrockResponsesClient.new(region: "ap-south-1", http: @http,
      credentials_provider: Aws::Credentials.new("test-access", "test-secret", "test-session"))
  end

  test "signs regional request and maps text and token usage without retaining responses" do
    result = generate
    assert_equal '{"items":[]}', result.output.message.content.first.text
    assert_equal 10, result.usage.input_tokens
    assert_equal 20, result.usage.output_tokens
    request = @requests.first
    assert_includes request["Authorization"], "bedrock-mantle/aws4_request"
    assert_equal "test-session", request["X-Amz-Security-Token"]
    assert_equal "ap-south-1", request.uri.host.split(".")[1]
    body = JSON.parse(request.body)
    assert_equal false, body["store"]
    assert_equal 4000, body["max_output_tokens"]
    assert_equal "openai.gpt-oss-120b", body["model"]
  end

  test "rejects truncated and empty successful responses" do
    @document[:status] = "incomplete"
    assert_raises(Knowledge::BedrockResponsesClient::Error) { generate }
    @document[:status] = "completed"
    @document[:output] = []
    assert_raises(Knowledge::BedrockResponsesClient::Error) { generate }
  end

  test "runtime endpoint signs with bedrock and omits unsupported reasoning parameter" do
    @client = Knowledge::BedrockResponsesClient.new(region: "us-east-1", endpoint: "runtime", reasoning_effort: "omit", http: @http,
      credentials_provider: Aws::Credentials.new("test-access", "test-secret"))
    generate
    request = @requests.first
    assert_equal "/openai/v1/responses", request.uri.path
    assert_equal "bedrock-runtime.us-east-1.amazonaws.com", request.uri.host
    assert_includes request["Authorization"], "/bedrock/aws4_request"
    assert_not JSON.parse(request.body).key?("reasoning")
  end

  test "HTTP failures exclude raw bodies from exception" do
    @response.stub(:is_a?, false) do
      @response.stub(:code, "403") do
        error = assert_raises(Knowledge::BedrockResponsesClient::Error) { generate }
        assert_equal "Bedrock Responses HTTP 403", error.message
      end
    end
  end

  private

  def generate
    @response.stub(:body, @document.to_json) do
      @client.converse(model_id: "openai.gpt-oss-120b", messages: [{ role: "user", content: [{ text: "Generate tips" }] }],
        inference_config: { max_tokens: 4000 })
    end
  end
end
