require "digest"

module AbusePrevention
  # Session-scoped database locks are shared by web/queue processes, and are
  # released automatically if a process/connection dies. Never wait in a queue
  # while holding a web thread or spawn a child before admission succeeds.
  class PdfExecutionSlots
    def self.with_capacity(user)
      ActiveRecord::Base.connection_pool.with_connection do |connection|
        held = []
        begin
          [["user:#{user.id}", 1], ["workspace:#{user.workspace_id}", 2], ["global", 2]].each do |scope, count|
            key = count.times.map { |slot| Digest::SHA256.digest("nexus:pdf-capacity:#{scope}:#{slot}").unpack1("q>") }
              .find { |candidate| connection.select_value("SELECT pg_try_advisory_lock(#{candidate})") }
            raise LimitExceeded.new("PDF processors are busy. Try again shortly.", retry_after: 30) unless key
            held << key
          end
          yield
        ensure
          held.reverse_each { |key| connection.select_value("SELECT pg_advisory_unlock(#{key})") }
        end
      end
    end
  end
end
