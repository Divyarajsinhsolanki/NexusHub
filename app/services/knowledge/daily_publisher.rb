require "aws-sdk-bedrockruntime"
require "json"

module Knowledge
  class DailyPublisher
    SOURCE = "bedrock_daily".freeze
    FIELDS = ["Rails", "React", "AWS", "Databases", "Security"].freeze
    COLLECTION = "Daily Tech Knowledge".freeze

    def self.enabled?
      ENV["DAILY_KNOWLEDGE_ENABLED"] == "true"
    end

    def self.workspace
      Workspace.find_by!(slug: ENV.fetch("DAILY_KNOWLEDGE_WORKSPACE_SLUG"), kind: "private")
    end

    def initialize(workspace:, client: nil)
      @workspace = workspace
      @client = client
    end

    def publish(date: Time.current.in_time_zone("Asia/Kolkata").to_date)
      raise ArgumentError, "Demo workspaces cannot publish" if @workspace.demo?
      owner = @workspace.users.find_by!(email: ENV.fetch("DAILY_KNOWLEDGE_OWNER_EMAIL"))
      Current.set(workspace: @workspace, user: owner) do
        @workspace.with_lock do
          existing = KnowledgePromptRun.where(source: SOURCE).where("metadata ->> 'daily_date' = ?", date.iso8601).first
          return existing if existing

          fields = FIELDS.rotate(date.jd % FIELDS.length).first(4)
          recent_titles = KnowledgeItem.joins(:knowledge_prompt_run).where(knowledge_prompt_runs: { source: SOURCE }).latest_first.limit(80).pluck(:title)
          prompt = build_prompt(fields, recent_titles)
          response = client.converse(
            model_id: model_id,
            messages: [{ role: "user", content: [{ text: prompt }] }],
            inference_config: { max_tokens: 2000, temperature: 0.4 }
          )
          text = response.output.message.content.map(&:text).compact.join
          items = parse_items(text, fields, recent_titles)
          run = owner.knowledge_prompt_runs.create!(
            prompt: prompt, source: SOURCE, generation_mode: "history", status: "completed",
            metadata: { daily_date: date.iso8601, workspace_shared: true, model_id: model_id, region: region,
                        input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
          )
          items.each_with_index do |item, index|
            owner.knowledge_items.create!(
              knowledge_prompt_run: run, title: item.fetch("title"), summary: item.fetch("summary"), body: item.fetch("body"),
              category: "tech", item_type: index == 3 ? "article" : "fact", collection_name: COLLECTION,
              source_name: "AI-generated · Amazon Bedrock", source_key: "daily-tech:#{date.iso8601}:#{index}",
              tags: [fields[index], index == 3 ? "technical-post" : "tech-tip"], position: index,
              published_at: Time.current, payload: { workspace_shared: true, daily_date: date.iso8601, model_id: model_id }
            )
          end
          # Archive only older automatic cards; personal notes and bookmarks stay intact.
          KnowledgeItem.active.joins(:knowledge_prompt_run).where(knowledge_prompt_runs: { source: SOURCE }).where.not(knowledge_prompt_run_id: run.id).find_each(&:archive!)
          post = run.knowledge_items.find_by!(item_type: "article")
          @workspace.users.where(status: "active", demo_account: false).find_each do |recipient|
            next if recipient.locked?
            Notification.create!(recipient: recipient, actor: owner, notifiable: post, action: "daily_knowledge_published",
              metadata: { knowledge_item_id: post.id, post_title: post.title, daily_date: date.iso8601 })
          end
          Rails.logger.info("daily_knowledge_published workspace=#{@workspace.id} date=#{date} run=#{run.id} input_tokens=#{response.usage.input_tokens} output_tokens=#{response.usage.output_tokens}")
          run
        end
      end
    end

    private

    def model_id
      ENV.fetch("DAILY_KNOWLEDGE_MODEL_ID", "amazon.nova-micro-v1:0")
    end

    def region
      ENV.fetch("DAILY_KNOWLEDGE_REGION", "us-east-1")
    end

    def client
      @client ||= Aws::BedrockRuntime::Client.new(region: region, http_open_timeout: 10, http_read_timeout: 90, retry_limit: 1)
    end

    def build_prompt(fields, recent_titles)
      <<~PROMPT
        Generate evergreen technical learning content for a Rails/React engineering workspace.
        Return ONLY valid JSON: {"items":[{"title":"...","summary":"...","body":"..."}, ...]}.
        Exactly four items, in this order: three practical tips about #{fields.first(3).join(', ')}, then one technical post about #{fields.last}.
        Each tip: 40-80 words. Post: 180-250 words with a practical example, when to use it, and one pitfall.
        Titles: 5-12 words. Summaries: one short sentence. Body is plain text, with literal code when useful, no HTML.
        Teach stable fundamentals, not news or recent releases. Do not invent citations, URLs, benchmarks, or version-specific claims.
        Never suggest executing destructive commands or weakening security. Mention review/testing for code examples.
        Cover distinct concepts. Avoid repeating these earlier titles/topics: #{recent_titles.to_json}.
      PROMPT
    end

    def parse_items(text, fields, recent_titles)
      document = JSON.parse(text.strip.sub(/\A```(?:json)?\s*/i, "").sub(/\s*```\z/, ""))
      items = document.fetch("items")
      raise ArgumentError, "Expected three tips and one post" unless items.is_a?(Array) && items.length == 4
      items.each do |item|
        raise ArgumentError, "Invalid generated item" unless item.is_a?(Hash)
        { "title" => 150, "summary" => 400, "body" => 6000 }.each do |key, limit|
          value = item[key]
          raise ArgumentError, "Invalid #{key}" unless value.is_a?(String) && value.strip.present? && value.length <= limit
          item[key] = value.strip
        end
      end
      titles = items.map { |item| item.fetch("title").downcase }
      raise ArgumentError, "Duplicate generated topic" unless titles.uniq.size == 4 && (titles & recent_titles.map(&:downcase)).empty?
      items
    end
  end
end
