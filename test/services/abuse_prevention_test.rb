require "test_helper"
require "minitest/mock"

class AbusePreventionTest < ActiveSupport::TestCase
  setup do
    @old_store = Rack::Attack.cache.store
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
    @workspace = Workspace.create!(name: "Abuse budgets", slug: "abuse-budgets", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "budget@example.test")
    Current.user, Current.workspace = @user, @workspace
  end
  teardown { Rack::Attack.cache.store = @old_store }

  test "authenticated counters survive different sessions and have retry guidance" do
    5.times { AbusePrevention::RateLimiter.check!(@user, :exports) }
    error = assert_raises(AbusePrevention::LimitExceeded) { AbusePrevention::RateLimiter.check!(@user.reload, :exports) }
    assert_operator error.retry_after, :>, 0
    other = create_test_user(workspace: @workspace, email: "other-budget@example.test")
    AbusePrevention::RateLimiter.check!(other, :exports)
  end

  test "workspace counters bound distributed activity across different users" do
    4.times do |index|
      user = index.zero? ? @user : create_test_user(workspace: @workspace, email: "counter-#{index}@example.test")
      5.times { AbusePrevention::RateLimiter.check!(user, :exports) }
    end
    fifth = create_test_user(workspace: @workspace, email: "counter-5@example.test")
    assert_raises(AbusePrevention::LimitExceeded) { AbusePrevention::RateLimiter.check!(fifth, :exports) }
  end

  test "pending upload slots and reserved bytes cannot grow without a bound" do
    10.times do
      AbusePrevention::StorageBudget.reserve!(@user, bytes: 1) do
        ActiveStorage::Blob.create_before_direct_upload!(filename: "pending.txt", byte_size: 1, checksum: Digest::MD5.base64digest("x"),
          metadata: { mobile_upload: true, workspace_id: @workspace.id, uploaded_by_user_id: @user.id, upload_verified: false, upload_expires_at: 15.minutes.from_now.iso8601 })
      end
    end
    assert_raises(AbusePrevention::LimitExceeded) { AbusePrevention::StorageBudget.reserve!(@user, bytes: 1) { flunk } }
  end

  test "storage accounting deduplicates chat and PDF snapshots and includes pending reservations" do
    @user.cover_photo.attach(io: StringIO.new("image"), filename: "cover.txt", content_type: "text/plain")
    blob = @user.cover_photo.blob
    @user.profile_picture.attach(blob)
    assert_equal 5, AbusePrevention::StorageBudget.blobs(@workspace).sum(:byte_size)
    Saas::PlanCatalog.stub(:find, Saas::PlanCatalog.find("starter").merge(storage_limit_bytes: 1)) do
      # Pinning/reusing existing bytes must still work after a plan downgrade.
      AbusePrevention::StorageBudget.check!(@workspace, bytes: blob.byte_size, blob:)
    end
    small_plan = Saas::PlanCatalog.find("starter").merge(storage_limit_bytes: 6)
    Saas::PlanCatalog.stub(:find, small_plan) do
      assert_raises(AbusePrevention::LimitExceeded) { AbusePrevention::StorageBudget.reserve!(@user, bytes: 2) { flunk } }
      assert_raises(AbusePrevention::LimitExceeded) do
        @user.cover_photo.attach(io: StringIO.new("overflow"), filename: "large.txt", content_type: "text/plain")
      end
    end
  end

  test "pending PDF operations are limited per user and free their slot on completion" do
    operations = 3.times.map { @user.pdf_document_operations.create!(workspace: @workspace, kind: "merge", parameters: {}) }
    assert_raises(AbusePrevention::LimitExceeded) { @user.pdf_document_operations.create!(workspace: @workspace, kind: "merge", parameters: {}) }
    operations.first.update!(status: "completed")
    assert_difference("PdfDocumentOperation.unscoped.count", 1) do
      @user.pdf_document_operations.create!(workspace: @workspace, kind: "merge", parameters: {})
    end
  end
end

class AbuseQueueRetryTest < ActiveSupport::TestCase
  test "busy processors leave asynchronous operations queued for retry" do
    workspace = Workspace.create!(name: "Busy PDFs", slug: "busy-pdfs", kind: "private")
    user = create_test_user(workspace:, email: "busy-pdfs@example.test")
    Current.user, Current.workspace = user, workspace
    operation = user.pdf_document_operations.create!(workspace:, kind: "merge", parameters: {})
    PdfDocuments::Execution.stub(:enabled?, true) do
      AbusePrevention::PdfExecutionSlots.stub(:with_capacity, ->(*) { raise AbusePrevention::LimitExceeded }) do
        assert_raises(AbusePrevention::LimitExceeded) { PdfDocuments::Execution.operation(operation, defer_when_busy: true) }
        assert_equal "queued", operation.reload.status
        assert_raises(AbusePrevention::LimitExceeded) { PdfDocuments::Execution.operation(operation) }
        assert_equal "failed", operation.reload.status
      end
    end
  end
end

class McpWorkBudgetTest < ActiveSupport::TestCase
  test "batch work consumes the same budget as individual messages" do
    previous = Rack::Attack.cache.store
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
    actor = Struct.new(:id, :workspace_id).new(9991, 9992)
    3.times { AbusePrevention::RateLimiter.check!(actor, :mcp, cost: 20) }
    assert_raises(AbusePrevention::LimitExceeded) { AbusePrevention::RateLimiter.check!(actor, :mcp) }
  ensure
    Rack::Attack.cache.store = previous
  end
end
