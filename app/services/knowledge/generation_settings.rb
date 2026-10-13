module Knowledge
  class GenerationSettings
    attr_reader :api, :endpoint, :model_id, :region, :max_tokens, :reasoning_effort

    def initialize(env: ENV)
      @api = env.fetch("DAILY_KNOWLEDGE_API", "responses")
      @endpoint = env.fetch("DAILY_KNOWLEDGE_ENDPOINT", "mantle")
      raise ArgumentError, "DAILY_KNOWLEDGE_API must be responses or converse" unless %w[responses converse].include?(@api)
      raise ArgumentError, "DAILY_KNOWLEDGE_ENDPOINT must be mantle or runtime" unless %w[mantle runtime].include?(@endpoint)
      @model_id = env.fetch("DAILY_KNOWLEDGE_MODEL_ID", @api == "responses" ? "openai.gpt-oss-120b" : "amazon.nova-micro-v1:0")
      @region = env.fetch("DAILY_KNOWLEDGE_REGION", "ap-south-1")
      raise ArgumentError, "Model ID cannot be blank" if @model_id.strip.empty?
      raise ArgumentError, "Invalid AWS region" unless @region.match?(/\A[a-z]{2}(?:-[a-z]+)+-\d\z/)
      @max_tokens = Integer(env.fetch("DAILY_KNOWLEDGE_MAX_TOKENS", @api == "responses" ? "4000" : "2000"), 10)
      raise ArgumentError, "DAILY_KNOWLEDGE_MAX_TOKENS must be 256..8000" unless (256..8000).cover?(@max_tokens)
      @reasoning_effort = env.fetch("DAILY_KNOWLEDGE_REASONING_EFFORT", "low")
      unless %w[omit low medium high].include?(@reasoning_effort)
        raise ArgumentError, "DAILY_KNOWLEDGE_REASONING_EFFORT must be omit, low, medium or high"
      end
      if @api == "responses" && @endpoint == "runtime" && @model_id.start_with?("openai.gpt-oss-")
        raise ArgumentError, "GPT OSS Responses requires the mantle endpoint"
      end
    end

    def client
      if api == "converse"
        Aws::BedrockRuntime::Client.new(region: region, http_open_timeout: 10, http_read_timeout: 90, retry_limit: 1)
      else
        BedrockResponsesClient.new(region: region, endpoint: endpoint, reasoning_effort: reasoning_effort)
      end
    end
  end
end
