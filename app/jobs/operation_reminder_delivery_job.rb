class OperationReminderDeliveryJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 5

  def perform(id)
    record = OperationReminderDelivery.unscoped.find_by(id: id)
    return unless record
    Current.set(workspace: record.workspace) do
      record.project.with_lock do
        record.reload
        return if record.state.in?(%w[sent skipped cancelled]) || record.send_at > Time.current
        return if record.state == 'failed' && record.claimed_at && record.claimed_at > [2**[record.attempts, 12].min, 3_600].min.seconds.ago
        unless eligible?(record)
          record.update!(state: 'skipped')
          return
        end
        record.update!(state: 'processing', claimed_at: Time.current, attempts: record.attempts + 1, failure_class: nil)
        begin
          deliver!(record)
          record.update!(state: 'sent', sent_at: Time.current)
        rescue StandardError => error
          # Save only the exception class; provider errors may include content.
          record.update!(state: 'failed', failure_class: error.class.name)
          # Do not raise inside this transaction: retain the attempt for the
          # minute sweep to retry without falsely recording successful delivery.
        end
      end
    end
  end

  private

  def eligible?(record)
    return false unless Operations::Schedules.delivery_current?(record)
    return false unless record.recipient.active? && record.project.project_users.exists?(user_id: record.recipient_id, status: 'active')
    return false unless record.recipient.notification_preference_enabled?('calendar_reminder')
    return false if record.workspace.demo?
    true
  end

  def deliver!(record)
    if record.channel == 'email'
      OperationReminderMailer.reminder(record).deliver_now
    else
      source = record.source
      notification = Notification.create!(workspace: record.workspace, recipient: record.recipient, actor: record.recipient,
        action: 'operations_reminder', notifiable: source,
        metadata: { title: source.name, event_start_at: source.is_a?(ProjectDeployment) ? source.scheduled_at : source.details['expiry_date'],
          path: Operations::Schedules.path_for(source), project_id: source.project_id,
          kind: source.is_a?(ProjectDeployment) ? 'deployment' : 'license' })
      record.update!(notification: notification)
    end
  end
end
