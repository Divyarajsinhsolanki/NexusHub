module AbusePrevention
  class RateLimiter
    class Unavailable < StandardError; end
    # Stable database identities, never client-provided user/workspace headers.
    POLICIES = {
      search: [60, 300, 60], files: [300, 1500, 60], writes: [120, 600, 60], uploads: [30, 120, 3600], pdf: [30, 120, 3600],
      exports: [5, 20, 3600], messages: [60, 300, 60], mcp: [60, 300, 60],
      invitations: [20, 60, 3600], integration: [20, 60, 3600]
    }.freeze

    def self.redis_store(url:)
      ActiveSupport::Cache::RedisCacheStore.new(
        url:, namespace: "nexus:rate-limits",
        error_handler: ->(**) { raise Unavailable, "Rate limiting is temporarily unavailable." }
      )
    end

    def self.check!(user, category, cost: 1)
      return unless user
      raise ArgumentError, "Invalid rate cost" unless cost.is_a?(Integer) && cost.between?(1, 20)
      user_limit, workspace_limit, period = POLICIES.fetch(category)
      [["user", user.id, user_limit], ["workspace", user.workspace_id, workspace_limit]].each do |scope, id, limit|
        count = nil
        cost.times { count = Rack::Attack.cache.count("authenticated:#{category}:#{scope}:#{id}", period) }
        raise Unavailable, "Rate limiting is temporarily unavailable." unless count.is_a?(Numeric)
        retry_after = period - (Time.now.to_i % period)
        raise LimitExceeded.new("Too many #{category} requests. Try again later.", retry_after:) if count > limit
      end
    end
  end
end
