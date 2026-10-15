require "test_helper"

class WorkspaceInvitationConcurrencyTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper
  self.use_transactional_tests = false

  setup do
    clear_enqueued_jobs
    @workspace = Workspace.create!(name: "Concurrent Invites", slug: "concurrent-invites-#{SecureRandom.hex(6)}", kind: "private", plan_key: "enterprise", billing_status: "active", seat_limit_override: 2)
    @owner = create_test_user(workspace: @workspace, email: "owner-#{SecureRandom.hex(6)}@concurrency.example")
    Current.set(workspace: @workspace) { @owner.roles = [Role.find_by!(name: "owner")] }
  end

  teardown do
    Current.set(workspace: @workspace) { @workspace.destroy! } if @workspace&.persisted?
    clear_enqueued_jobs
  end

  test "concurrent invitations cannot oversubscribe the last available seat" do
    outcomes = race do |index|
      WorkspaceInvitations.issue!(actor: User.find(@owner.id), attributes: { email: "member-#{index}-#{SecureRandom.hex(6)}@concurrency.example" })
    end
    assert_equal 1, outcomes.count(:success)
    assert_equal 1, outcomes.count(ActiveRecord::RecordInvalid)
    assert_equal 1, WorkspaceSeats.reserved(@workspace)
  end

  test "concurrent acceptance consumes a token once and creates only one member" do
    invite = WorkspaceInvitations.issue!(actor: @owner, attributes: { email: "accept-#{SecureRandom.hex(6)}@concurrency.example" })
    token = WorkspaceInvitation.decrypt_token(enqueued_jobs.last[:args][1])
    outcomes = race do |_index|
      WorkspaceInvitations.accept!(raw: token, attributes: { first_name: "Joined", last_name: "Once", password: "Password!42", password_confirmation: "Password!42" })
    end
    assert_equal 1, outcomes.count(:success)
    assert_equal 1, outcomes.count(WorkspaceInvitations::InvalidInvitation)
    assert_equal 1, User.where(email: invite.email).count
    assert_equal 2, WorkspaceSeats.used(@workspace)
  end

  test "inviter suspended while waiting for the workspace lock cannot create an invitation" do
    waiting = Queue.new
    outcome = Queue.new
    worker = nil
    @workspace.with_lock do
      worker = Thread.new do
        ApplicationRecord.connection_pool.with_connection do
          begin
            actor = User.find(@owner.id)
            workspace = actor.workspace
            actor.define_singleton_method(:workspace) { workspace }
            workspace.define_singleton_method(:with_lock) do |*args, &block|
              waiting << true
              super(*args, &block)
            end
            WorkspaceInvitations.issue!(actor: actor, attributes: { email: "revoked-#{SecureRandom.hex(6)}@concurrency.example" })
            outcome << :success
          rescue StandardError => error
            outcome << error.class
          ensure
            Current.reset_all
          end
        end
      end
      Timeout.timeout(10) { waiting.pop }
      @owner.membership_for.update!(status: "suspended")
    end
    assert worker.join(20), "Invitation worker did not finish"
    assert_equal WorkspaceInvitations::InvalidInvitation, outcome.pop
    assert_equal 0, WorkspaceInvitation.in_workspace(@workspace).count
    assert_empty enqueued_jobs
  ensure
    worker&.kill if worker&.alive?
    worker&.join
  end

  private

  def race
    ready = Queue.new
    start = Queue.new
    results = Queue.new
    threads = 2.times.map do |index|
      Thread.new do
        ApplicationRecord.connection_pool.with_connection do
          Current.reset_all
          ready << true
          start.pop
          begin
            yield index
            results << :success
          rescue StandardError => error
            results << error.class
          ensure
            Current.reset_all
          end
        end
      end
    end
    2.times { ready.pop }
    2.times { start << true }
    threads.each(&:join)
    2.times.map { results.pop }
  end
end
