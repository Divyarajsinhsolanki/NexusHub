require 'test_helper'
require 'minitest/mock'

class OperationSchedulesTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  setup do
    travel_to Time.utc(2026, 10, 8, 6)
    @workspace = Workspace.create!(name: 'Release operations', slug: 'release-operations', kind: 'private')
    @owner = create_test_user(workspace: @workspace, email: 'release-owner@example.test')
    @recipient = create_test_user(workspace: @workspace, email: 'release-recipient@example.test')
    Current.workspace = @workspace
    Current.user = @owner
    @project = Project.create!(name: 'Release project', owner: @owner)
    [@owner, @recipient].each { |user| ProjectUser.create!(project: @project, user: user, role: 'developer', status: 'active') }
    @environment = ProjectEnvironment.create!(project: @project, name: 'Production')
    @software = ProjectOperationItem.create!(project: @project, kind: 'software', name: 'Redis')
    @entry = @software.entries.create!(project: @project, project_environment: @environment, expected_version: '6.0', observed_version: '6.0', observed_at: 1.day.ago, source: 'manual')
    clear_enqueued_jobs
    ActionMailer::Base.deliveries.clear
  end

  teardown do
    travel_back
    clear_enqueued_jobs
  end

  test 'future deployment targets stay separate and freeze when started' do
    release = deployment
    assert_equal '6.0', @entry.reload.expected_version
    Operations::DeploymentWorkflow.transition!(release, 'in_progress')
    assert release.started_at
    assert_raises(ActiveRecord::RecordInvalid) { release.update!(targets: []) }
    release.reload
    assert_raises(Operations::Error) { Operations::DeploymentWorkflow.observe!(release, observations) }
    Operations::DeploymentWorkflow.transition!(release, 'deployed')
    assert_raises(Operations::Error) { Operations::DeploymentWorkflow.verify!(release, actor: @owner) }
    Operations::DeploymentWorkflow.observe!(release, observations)
    assert_equal '6.0', @entry.reload.expected_version
    Operations::DeploymentWorkflow.verify!(release, actor: @owner)
    assert_equal '7.0', @entry.reload.expected_version
    assert_equal '7.0', @entry.observed_version
    assert_equal @owner.id, @entry.verified_by_id
    assert @entry.verified_at
    assert_equal @owner.id, release.verified_by_id
    assert_raises(Operations::Error) { Operations::DeploymentWorkflow.observe!(release, observations) }
  end

  test 'verification refuses mismatch stale future and absent observations or empty targets' do
    release = complete(deployment)
    Operations::DeploymentWorkflow.observe!(release, observations(version: '6.0'))
    assert_equal 'mismatch', release.verification.first['status']
    assert_raises(Operations::Error) { Operations::DeploymentWorkflow.verify!(release, actor: @owner) }
    [1.second.ago, 1.hour.from_now].each do |at|
      release.update!(observations: observations.map { |row| row.merge('observed_at' => at.iso8601(6)) })
      assert_equal 'stale', release.verification.first['status']
      assert_raises(Operations::Error) { Operations::DeploymentWorkflow.verify!(release, actor: @owner) }
    end
    empty = complete(deployment(name: 'No version targets', targets: []))
    assert_raises(Operations::Error) { Operations::DeploymentWorkflow.verify!(empty, actor: @owner) }
    assert_equal '6.0', @entry.reload.expected_version
  end

  test 'older deployed release cannot replace a newer approved baseline' do
    old = complete(deployment(name: 'Old'))
    travel 10.minutes
    recent = complete(deployment(name: 'Recent', targets: targets(version: '8.0')))
    Operations::DeploymentWorkflow.observe!(recent, observations(version: '8.0'))
    Operations::DeploymentWorkflow.verify!(recent, actor: @owner)
    Operations::DeploymentWorkflow.observe!(old, observations)
    error = assert_raises(Operations::Error) { Operations::DeploymentWorkflow.verify!(old, actor: @owner) }
    assert_match(/newer deployment/, error.message)
    assert_equal '8.0', @entry.reload.expected_version
  end

  test 'CSV observation parsing previews target rows without changing versions' do
    release = complete(deployment)
    rows = Operations::DeploymentWorkflow.parse_observation_csv(release, "name,observed_version,source\nRedis,7.0,server command\n")
    assert_equal @software.id, rows.first['item_id']
    assert_empty release.reload.observations
    assert_equal '6.0', @entry.reload.expected_version
    Operations::DeploymentWorkflow.observe!(release, rows)
    assert_equal 'match', release.verification.first['status']
    ["name,observed_version\nRedis,7.0\nRedis,7.1", "name,observed_version\nUnknown,private-value", "name,observed_version\nRedis,\"unterminated"].each do |content|
      error = assert_raises(Operations::Error) { Operations::DeploymentWorkflow.parse_observation_csv(release, content) }
      assert_not_includes error.message, 'private-value'
    end
  end

  test 'schedule validates project and member relationships and version lengths' do
    foreign = Project.create!(name: 'Other releases')
    other_env = ProjectEnvironment.create!(project: foreign, name: 'Production')
    assert_raises(ActiveRecord::RecordInvalid) { deployment(project_environment: other_env) }
    assert_raises(ActiveRecord::RecordInvalid) { deployment(time_zone: 'Eastern Time (US & Canada)') }
    assert_raises(ActiveRecord::RecordInvalid) { deployment(targets: targets(version: 'x' * 161)) }
    @recipient.update!(status: 'locked')
    assert_raises(ActiveRecord::RecordInvalid) { deployment(recipient_ids: [@recipient.id]) }
  end

  test 'monthly recurrence skips nonexistent dates and honors its end date' do
    record = series(frequency: 'monthly', day_of_month: 31, starts_on: Date.new(2026, 1, 1), ends_on: Date.new(2026, 4, 1))
    dates = Operations::Recurrence.occurrences(record, now: Time.utc(2026, 1, 1), horizon: 100.days).map(&:first)
    assert_equal %w[2026-01-31 2026-03-31], dates
  end

  test 'a remaining member can complete and verify a deployment after its owner leaves' do
    release = deployment
    Operations::DeploymentWorkflow.transition!(release, 'in_progress')
    ProjectUser.find_by!(project: @project, user: @owner).update!(status: 'removed')

    Operations::DeploymentWorkflow.transition!(release, 'deployed')
    Operations::DeploymentWorkflow.observe!(release, observations)
    Operations::DeploymentWorkflow.verify!(release, actor: @recipient)

    assert_equal 'deployed', release.reload.status
    assert_equal @owner.id, release.owner_id
    assert_equal @recipient.id, release.verified_by_id
    assert_equal '7.0', @entry.reload.expected_version
    assert_raises(ActiveRecord::RecordInvalid) { deployment(owner: @owner) }
  end

  test 'inactive existing recipients do not prevent deployment completion but cannot be newly assigned' do
    release = deployment(recipient_ids: [@recipient.id])
    Operations::DeploymentWorkflow.transition!(release, 'in_progress')
    @recipient.update!(status: 'locked')

    Operations::DeploymentWorkflow.transition!(release, 'deployed')
    Operations::DeploymentWorkflow.observe!(release, observations)
    Operations::DeploymentWorkflow.verify!(release, actor: @owner)

    assert_equal [@recipient.id], release.reload.recipient_ids
    assert_equal @owner.id, release.verified_by_id
    assert_equal '7.0', @entry.reload.expected_version
    unassigned = deployment
    assert_raises(ActiveRecord::RecordInvalid) { unassigned.update!(recipient_ids: [@recipient.id]) }
    assert_raises(ActiveRecord::RecordInvalid) { unassigned.update!(recipient_ids: [], owner: @recipient) }
  end

  test 'local recurrence shifts a skipped clock time and uses earlier repeated offset' do
    assert_equal Time.utc(2026, 3, 8, 7, 30), Operations::Recurrence.local_time(Date.new(2026, 3, 8), '02:30', 'America/New_York')
    assert_equal Time.utc(2026, 11, 1, 5, 30), Operations::Recurrence.local_time(Date.new(2026, 11, 1), '01:30', 'America/New_York')
    assert_equal Time.utc(2026, 10, 9, 3, 30), Operations::Recurrence.local_time(Date.new(2026, 10, 9), '09:00', 'Asia/Kolkata')
  end

  test 'rolling materialization is idempotent and recovers without current workspace' do
    record = series
    Operations::Schedules.materialize!(record)
    count = record.project_deployments.count
    assert count.between?(12, 14)
    assert_equal count, CalendarEvent.where(operation_source_type: 'ProjectDeployment').count
    assert_no_difference ['ProjectDeployment.count', 'OperationReminderDelivery.count', 'CalendarEvent.count'] do
      Operations::Schedules.materialize!(record)
    end
    travel 7.days
    Current.reset_all
    OperationScheduleMaterializeJob.perform_now
    Current.workspace = @workspace
    assert_operator record.project_deployments.count, :>, count
    assert_equal 1, @project.reload.operations_revision
  end

  test 'licence reminders use 9 AM local dates and renewal invalidates prior deliveries' do
    item = license
    Operations::Schedules.sync_license!(item)
    deliveries = OperationReminderDelivery.where(source: item)
    assert_equal 12, deliveries.count
    expected = [30, 7, 1].map { |offset| Operations::Recurrence.local_time(Date.new(2026, 12, 1) - offset.days, '09:00', 'Asia/Kolkata') }
    assert_equal expected.sort, deliveries.distinct.pluck(:send_at).sort
    assert_equal [@owner.id, @recipient.id].sort, deliveries.distinct.pluck(:recipient_id).sort
    assert_equal %w[email in_app], deliveries.distinct.pluck(:channel).sort
    old_ids = deliveries.pluck(:id)
    item.update!(details: item.details.merge('expiry_date' => '2027-01-01'))
    Operations::Schedules.sync_license!(item)
    assert_equal ['cancelled'], OperationReminderDelivery.where(id: old_ids).distinct.pluck(:state)
    event = CalendarEvent.find_by!(operation_source: item)
    assert_equal Time.utc(2027, 1, 1, 3, 30), event.start_at
    assert_match %r{/projects/#{@project.id}/dashboard\?tab=environments}, event.operation_path
    item.update!(details: item.details.merge('expiry_date' => nil))
    Operations::Schedules.sync_license!(item)
    assert_not CalendarEvent.exists?(operation_source: item)
    assert_equal 0, deliveries.where(state: 'pending').count
  end

  test 'late schedules skip elapsed offsets and completed deployments cancel outstanding reminders' do
    release = deployment(scheduled_at: 2.hours.from_now)
    Operations::Schedules.sync_deployment!(release)
    assert_equal [1.hour.from_now], OperationReminderDelivery.where(source: release).distinct.pluck(:send_at)
    complete(release)
    assert_equal ['cancelled'], OperationReminderDelivery.where(source: release).distinct.pluck(:state)
    assert CalendarEvent.find_by!(operation_source: release).completed?
    expired = license(details: license_details.merge('expiry_date' => '2026-10-01'))
    Operations::Schedules.sync_license!(expired)
    assert_equal 0, OperationReminderDelivery.where(source: expired).count
  end

  test 'restoring a licence schedule reactivates future cancelled reminders without repeating sent notices' do
    item = license
    original_details = item.details.deep_dup
    Operations::Schedules.sync_license!(item)
    original_deliveries = OperationReminderDelivery.where(source: item).to_a
    sent = original_deliveries.first
    sent.update!(state: 'sent', sent_at: Time.current)

    item.update!(details: original_details.merge('expiry_date' => '2027-01-01'))
    Operations::Schedules.sync_license!(item)
    assert_equal 'cancelled', original_deliveries.last.reload.state

    item.update!(details: original_details)
    assert_no_difference 'OperationReminderDelivery.count' do
      Operations::Schedules.sync_license!(item)
    end
    assert_equal 'sent', sent.reload.state
    assert_equal ['pending'], OperationReminderDelivery.where(id: original_deliveries.map(&:id) - [sent.id]).distinct.pluck(:state)
    assert_equal ['cancelled'], OperationReminderDelivery.where(source: item).where.not(id: original_deliveries.map(&:id)).distinct.pluck(:state)
  end

  test 'reminder delivery is deduplicated per channel and email contains only safe fields' do
    release = deployment(scheduled_at: 2.hours.from_now, notes: 'Never include this secret note')
    Operations::Schedules.sync_deployment!(release)
    travel 1.hour
    records = OperationReminderDelivery.where(source: release, recipient: @owner)
    in_app = records.find_by!(channel: 'in_app')
    email = records.find_by!(channel: 'email')
    assert_difference 'Notification.count', 1 do
      2.times { OperationReminderDeliveryJob.perform_now(in_app.id) }
    end
    assert_equal 'sent', in_app.reload.state
    assert_equal 1, in_app.attempts
    assert_equal 'operations_reminder', in_app.notification.action
    assert_not_includes in_app.notification.metadata.to_json, release.notes
    2.times { OperationReminderDeliveryJob.perform_now(email.id) }
    assert_equal 'sent', email.reload.state
    assert_equal 1, ActionMailer::Base.deliveries.size
    mail = ActionMailer::Base.deliveries.last
    assert_not_includes mail.body.encoded, release.notes
    assert_includes mail.text_part.body.decoded, '/dashboard?tab=environments&section=deployments'
    assert_match(/\Aoperations-reminder-#{email.id}@/, mail.message_id)
  end

  test 'deleting a sent notification preserves the delivery ledger and prevents another notice' do
    release = deployment(scheduled_at: 2.hours.from_now)
    Operations::Schedules.sync_deployment!(release)
    delivery = OperationReminderDelivery.find_by!(source: release, recipient: @owner, channel: 'in_app')
    travel 1.hour
    OperationReminderDeliveryJob.perform_now(delivery.id)
    delivery.reload
    assert_equal 'sent', delivery.state
    sent_at = delivery.sent_at

    assert_no_difference 'OperationReminderDelivery.count' do
      delivery.notification.destroy!
    end
    delivery.reload
    assert_nil delivery.notification_id
    assert_equal 'sent', delivery.state
    assert_equal sent_at, delivery.sent_at
    assert_no_difference 'Notification.count' do
      OperationReminderDeliveryJob.perform_now(delivery.id)
    end
    assert_equal 1, delivery.reload.attempts
  end

  test 'failed delivery remains failed until a successful retry and stores no exception content' do
    release = deployment(scheduled_at: 2.hours.from_now)
    Operations::Schedules.sync_deployment!(release)
    email = OperationReminderDelivery.find_by!(source: release, recipient: @owner, channel: 'email')
    travel 1.hour
    OperationReminderMailer.stub(:reminder, ->(*) { raise IOError, 'secret from provider' }) do
      OperationReminderDeliveryJob.perform_now(email.id)
    end
    assert_equal 'failed', email.reload.state
    assert_nil email.sent_at
    assert_equal 'IOError', email.failure_class
    assert_not_includes email.attributes.to_json, 'secret from provider'
    travel 1.minute
    OperationReminderDeliveryJob.perform_now(email.id)
    assert_equal 'sent', email.reload.state
    assert_equal 2, email.attempts
  end

  test 'deleting a reminder recipient and verifier retains the deployment and clears personal delivery references' do
    release = deployment(scheduled_at: 2.hours.from_now, recipient_ids: [@recipient.id])
    Operations::Schedules.sync_deployment!(release)
    travel 1.hour
    delivery = OperationReminderDelivery.find_by!(source: release, recipient: @recipient, channel: 'in_app')
    OperationReminderDeliveryJob.perform_now(delivery.id)
    notification_id = delivery.reload.notification_id
    complete(release)
    Operations::DeploymentWorkflow.observe!(release, observations)
    Operations::DeploymentWorkflow.verify!(release, actor: @recipient)
    verified_at = release.verified_at

    assert_difference 'User.count', -1 do
      @recipient.destroy!
    end
    assert_not OperationReminderDelivery.where(recipient_id: @recipient.id).exists?
    assert_not Notification.exists?(notification_id)
    assert OperationReminderDelivery.where(source: release, recipient: @owner).exists?
    assert CalendarEvent.exists?(operation_source: release)
    assert_nil release.reload.verified_by_id
    assert_equal verified_at, release.verified_at
    assert_equal 'deployed', release.status
    assert_nil @entry.reload.verified_by_id
    assert_nil @entry.updated_by_id
    assert_equal '7.0', @entry.expected_version
  end

  test 'users owning historical deployments recurring series or licences cannot be deleted' do
    [-> { complete(deployment) }, -> { series }, -> { license }].each do |build_source|
      source = build_source.call
      @owner.reload
      assert_no_difference 'User.count' do
        assert_not @owner.destroy
      end
      assert_match(/Reassign operational ownership/, @owner.errors.full_messages.join)
      assert source.class.exists?(source.id)
      assert ProjectUser.exists?(project: @project, user: @owner)
      source.destroy!
    end
  end

  test 'removing a workspace removes project operations before their owners' do
    # Membership fixtures emit unrelated cross-user notifications with actor FKs.
    Notification.where(workspace: @workspace).delete_all
    release = complete(deployment)
    Operations::Schedules.sync_item!(license)
    @workspace.destroy!
    assert_not Workspace.exists?(@workspace.id)
    assert_not User.exists?(@owner.id)
    assert_not ProjectDeployment.unscoped.exists?(release.id)
    assert_not OperationReminderDelivery.unscoped.where(workspace_id: @workspace.id).exists?
    assert_not CalendarEvent.unscoped.where(workspace_id: @workspace.id).exists?
  end

  test 'delivery rechecks membership preferences and revision before sending' do
    release = deployment(scheduled_at: 2.hours.from_now, recipient_ids: [@recipient.id])
    Operations::Schedules.sync_deployment!(release)
    travel 1.hour
    recipient_delivery = OperationReminderDelivery.find_by!(source: release, recipient: @recipient, channel: 'email')
    ProjectUser.find_by!(project: @project, user: @recipient).update!(status: 'removed')
    OperationReminderDeliveryJob.perform_now(recipient_delivery.id)
    assert_equal 'skipped', recipient_delivery.reload.state
    owner_delivery = OperationReminderDelivery.find_by!(source: release, recipient: @owner, channel: 'email')
    @owner.update!(notification_preferences: { 'calendar_reminder' => false })
    OperationReminderDeliveryJob.perform_now(owner_delivery.id)
    assert_equal 'skipped', owner_delivery.reload.state
    stale = OperationReminderDelivery.find_by!(source: release, recipient: @owner, channel: 'in_app')
    release.update_column(:schedule_revision, release.schedule_revision + 1)
    OperationReminderDeliveryJob.perform_now(stale.id)
    assert_equal 'skipped', stale.reload.state
    assert_empty ActionMailer::Base.deliveries
  end

  test 'sweep catches pending and abandoned processing deliveries across workspaces' do
    release = deployment(scheduled_at: 2.hours.from_now)
    Operations::Schedules.sync_deployment!(release)
    travel 1.hour
    records = OperationReminderDelivery.where(source: release).to_a
    records.first.update!(state: 'processing', claimed_at: 16.minutes.ago)
    Current.reset_all
    assert_enqueued_jobs records.size, only: OperationReminderDeliveryJob do
      OperationReminderSweepJob.perform_now
    end
  end

  private

  def targets(version: '7.0')
    [{ 'item_id' => @software.id, 'name' => @software.name, 'expected_version' => version }]
  end

  def observations(version: '7.0')
    [{ 'item_id' => @software.id, 'observed_version' => version, 'source' => 'server command' }]
  end

  def deployment(**attrs)
    ProjectDeployment.create!({ project: @project, project_environment: @environment, owner: @owner, name: 'Release 2.0', scheduled_at: 3.days.from_now, time_zone: 'Asia/Kolkata', targets: targets }.merge(attrs))
  end

  def complete(release)
    Operations::DeploymentWorkflow.transition!(release, 'in_progress')
    Operations::DeploymentWorkflow.transition!(release, 'deployed')
    release
  end

  def series(**attrs)
    ProjectDeploymentSeries.create!({ project: @project, project_environment: @environment, owner: @owner, name: 'Weekly release', time_zone: 'Asia/Kolkata', frequency: 'weekly', local_time: '18:00', starts_on: Date.current, weekdays: [5], targets: targets }.merge(attrs))
  end

  def license_details
    { 'owner_id' => @owner.id, 'recipient_ids' => [@recipient.id], 'expiry_date' => '2026-12-01', 'time_zone' => 'Asia/Kolkata', 'reminder_days' => [30, 7, 1] }
  end

  def license(**attrs)
    ProjectOperationItem.create!({ project: @project, kind: 'license', name: 'Deployment tooling licence', details: license_details }.merge(attrs))
  end
end
