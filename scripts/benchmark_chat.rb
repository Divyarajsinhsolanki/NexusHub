# Run: RAILS_ENV=test bundle exec rails runner scripts/benchmark_chat.rb
# Synthetic data is always rolled back; this refuses non-local/non-test databases.
require "benchmark"
config = ActiveRecord::Base.connection_db_config
raise "Use the local test database" unless Rails.env.test? && config.database == "pdf_master_test" &&
  [nil, "localhost", "127.0.0.1", "::1"].include?(config.configuration_hash[:host])

begin
  ActiveRecord::Base.transaction do
    workspace = Workspace.create!(name: "Chat benchmark", slug: "chat-benchmark-#{SecureRandom.hex(5)}", kind: "private")
    Current.workspace = workspace
    user = workspace.users.create!(email: "benchmark-#{SecureRandom.hex(5)}@example.test", password: "Local-benchmark!42",
      password_confirmation: "Local-benchmark!42", first_name: "Chat", last_name: "Benchmark", job_title: "Test", status: "active", confirmed_at: Time.current)
    Current.user = user
    conversation = Conversation.create!(creator: user, conversation_type: "group", title: "10,000 messages")
    conversation.conversation_participants.create!(user: user)
    now = Time.current
    Message.insert_all!((1..10_000).map { |index| { workspace_id: workspace.id, conversation_id: conversation.id, user_id: user.id,
      body: "Benchmark message #{index}", message_type: "message", created_at: now - (10_001 - index).seconds, updated_at: now } })
    message_ids = conversation.messages.limit(100).pluck(:id)
    MessageReaction.insert_all!(message_ids.map { |id| { workspace_id: workspace.id, message_id: id, user_id: user.id, emoji: "👍", created_at: now, updated_at: now } })
    counts = []
    [50, 100].each do |limit|
      sql = []
      timings = []
      6.times do
        count = 0
        listener = ->(*args) { count += 1 if args.last[:sql].match?(/\ASELECT/i) && !args.last[:cached] }
        timings << Benchmark.realtime do
          ActiveRecord::Base.uncached do
            ActiveSupport::Notifications.subscribed(listener, "sql.active_record") do
              conversation.messages.includes(:message_reactions, reply_to: [:user, :attachments_attachments], user: { profile_picture_attachment: :blob })
                .with_attached_attachments.order(id: :asc).limit(limit).each do |message|
                message.chat_context
                message.user.full_name
                message.user.profile_picture.attached?
                message.attachments.to_a
                message.reaction_counts
                message.reacted_emojis_for(user)
              end
            end
          end
        end
        sql << count
      end
      counts << sql.last
      puts({ messages: 10_000, page_size: limit, queries: sql.drop(1), warm_ms: timings.drop(1).map { |time| (time * 1000).round(2) } }.to_json)
    end
    raise "Query count grows with page size" if counts.last > counts.first
    raise ActiveRecord::Rollback
  end
ensure
  Current.reset_all
end
