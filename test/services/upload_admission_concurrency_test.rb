require "test_helper"

class UploadAdmissionConcurrencyTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  test "simultaneous reservations cannot oversubscribe the actor's byte budget" do
    workspace = Workspace.create!(name: "Upload concurrency", slug: "upload-race-#{SecureRandom.hex(8)}", kind: "private")
    user = create_test_user(workspace:, email: "upload-race-#{workspace.id}@example.test")
    user.workspace # preload before threads
    start, results = Queue.new, Queue.new
    threads = 2.times.map do
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          start.pop
          begin
            AbusePrevention::StorageBudget.reserve!(user, bytes: 150.megabytes) do
              ActiveStorage::Blob.create_before_direct_upload!(filename: "reserved.bin", byte_size: 150.megabytes,
                checksum: Digest::MD5.base64digest("test"), metadata: { mobile_upload: true, workspace_id: workspace.id,
                  uploaded_by_user_id: user.id, upload_verified: false, upload_expires_at: 15.minutes.from_now.iso8601 })
            end
            results << :accepted
          rescue AbusePrevention::LimitExceeded
            results << :rejected
          end
        end
      end
    end
    2.times { start << true }
    threads.each(&:value)
    assert_equal [:accepted, :rejected], 2.times.map { results.pop }.sort
  ensure
    if workspace
      ActiveStorage::Blob.where("metadata::jsonb ->> 'workspace_id' = ?", workspace.id.to_s).find_each(&:purge)
      Current.workspace = workspace
      workspace.destroy!
    end
    Current.reset_all
  end
end
