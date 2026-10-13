require "aws-sdk-core"
require "aws-sigv4"
require "net/http"
require "json"

module Knowledge
  # Keep the publisher's Converse-shaped result while using Mantle Responses.
  # SigV4 resolves and refreshes the server's role credentials on every request.
  class BedrockResponsesClient
    class Error < StandardError; end
    Content = Struct.new(:text)
    Message = Struct.new(:content)
    Output = Struct.new(:message)
    Usage = Struct.new(:input_tokens, :output_tokens)
    Result = Struct.new(:output, :usage)

    def initialize(region:, endpoint: "mantle", reasoning_effort: "low", credentials_provider: Aws::CredentialProviderChain.new.resolve, http: Net::HTTP)
      raise ArgumentError, "Invalid AWS region" unless region.match?(/\A[a-z]{2}(?:-[a-z]+)+-\d\z/)
      raise ArgumentError, "Invalid Bedrock endpoint" unless %w[mantle runtime].include?(endpoint)
      @reasoning_effort = reasoning_effort
      @uri = URI(endpoint == "mantle" ? "https://bedrock-mantle.#{region}.api.aws/v1/responses" : "https://bedrock-runtime.#{region}.amazonaws.com/openai/v1/responses")
      @signer = Aws::Sigv4::Signer.new(service: endpoint == "mantle" ? "bedrock-mantle" : "bedrock", region: region, credentials_provider: credentials_provider)
      @http = http
    end

    def converse(model_id:, messages:, inference_config:)
      payload = { model: model_id,
        input: messages.map { |message| { role: message.fetch(:role), content: message.fetch(:content).map { |part| part.fetch(:text) }.join } },
        max_output_tokens: inference_config.fetch(:max_tokens), store: false }
      payload[:reasoning] = { effort: @reasoning_effort } unless @reasoning_effort == "omit"
      body = JSON.generate(payload)
      headers = { "Content-Type" => "application/json" }
      signature = @signer.sign_request(http_method: "POST", url: @uri.to_s, headers: headers, body: body)
      request = Net::HTTP::Post.new(@uri, headers.merge(signature.headers))
      request.body = body
      response = @http.start(@uri.hostname, @uri.port, use_ssl: true, open_timeout: 10, read_timeout: 90) { |connection| connection.request(request) }
      # Do not include raw response bodies or signed request headers in errors.
      raise Error, "Bedrock Responses HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)
      document = JSON.parse(response.body)
      raise Error, "Bedrock response did not complete" unless document["status"] == "completed"
      text = document.fetch("output").select { |item| item["type"] == "message" }.flat_map { |item| item.fetch("content") }
        .select { |part| part["type"] == "output_text" }.map { |part| part.fetch("text") }.join
      raise Error, "Bedrock response contained no text" if text.strip.empty?
      usage = document.fetch("usage")
      Result.new(Output.new(Message.new([Content.new(text)])), Usage.new(usage.fetch("input_tokens"), usage.fetch("output_tokens")))
    end
  end
end
