class ScheduledChatDeliveryJob < ApplicationJob
  queue_as :default
  def perform(id)
    schedule = ScheduledChatMessage.unscoped.includes(:workspace, :user, :conversation).find_by(id: id)
    return unless schedule
    Current.set(workspace: schedule.workspace, user: schedule.user) do
      schedule.with_lock do
        return unless schedule.state == 'pending' && schedule.send_at <= Time.current
        membership = schedule.conversation.conversation_participants.find_by(user_id: schedule.user_id)
        unless membership && schedule.user.workspace_id == schedule.workspace_id && !schedule.workspace.demo?
          schedule.update!(state: 'cancelled')
          return
        end
        message = schedule.conversation.messages.find_or_initialize_by(user: schedule.user, client_id: "scheduled-#{schedule.id}")
        if message.new_record?
          message.body = schedule.body
          message.reply_to = schedule.reply_to unless schedule.reply_to&.deleted_at?
          message.attachments = schedule.attachments.map(&:blob)
          message.save!
        end
        schedule.update!(state: 'sent', sent_message: message)
      end
    end
  end
end
