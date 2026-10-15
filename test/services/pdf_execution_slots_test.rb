require "test_helper"

class PdfExecutionSlotsTest < ActiveSupport::TestCase
  self.use_transactional_tests = false
  test "global slots bound work across unrelated workspaces" do
    outcomes, release = Queue.new, Queue.new
    threads = 3.times.map do |index|
      Thread.new do
        actor = Struct.new(:id, :workspace_id).new(876_000 + index, 876_000 + index)
        begin
          AbusePrevention::PdfExecutionSlots.with_capacity(actor) do
            outcomes << :entered
            release.pop
          end
        rescue AbusePrevention::LimitExceeded
          outcomes << :rejected
        rescue StandardError => error
          outcomes << error
        end
      end
    end
    results = 3.times.map { outcomes.pop }
    3.times { release << true }
    threads.each(&:value)
    assert_equal 2, results.count(:entered), results.inspect
    assert_equal 1, results.count(:rejected), results.inspect
  ensure
    3.times { release << true } if release
    threads&.each(&:join)
  end

  test "different connections cannot execute concurrently for the same actor and release slots on exceptions" do
    user = Struct.new(:id, :workspace_id).new(987654, 987654)
    blocked = Queue.new
    AbusePrevention::PdfExecutionSlots.with_capacity(user) do
      thread = Thread.new do
        begin
          AbusePrevention::PdfExecutionSlots.with_capacity(user) { blocked << :entered }
        rescue AbusePrevention::LimitExceeded
          blocked << :rejected
        end
      end
      thread.join
      assert_equal :rejected, blocked.pop
    end
    assert_raises(RuntimeError) { AbusePrevention::PdfExecutionSlots.with_capacity(user) { raise "worker failed" } }
    assert_equal :available, AbusePrevention::PdfExecutionSlots.with_capacity(user) { :available }
  end
end
