class EventReminder < ApplicationRecord
  include WorkspaceScoped

  CHANNELS = %w[in_app email slack].freeze

  belongs_to :calendar_event

  enum :state, {
    pending: 'pending',
    sent: 'sent',
    failed: 'failed'
  }, default: 'pending'

  validates :channel, :minutes_before, :send_at, :state, presence: true
  validates :channel, inclusion: { in: CHANNELS }
  validates :minutes_before, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  before_validation :calculate_send_at, if: :needs_send_at_recalculation?
  after_commit :schedule_delivery_job, on: [:create, :update], if: :pending?

  private

  def needs_send_at_recalculation?
    send_at.blank? || will_save_change_to_minutes_before? || will_save_change_to_calendar_event_id?
  end

  def calculate_send_at
    return if calendar_event.blank? || calendar_event.start_at.blank?

    self.send_at = calendar_event.start_at - minutes_before.to_i.minutes
  end

  def schedule_delivery_job
    return if send_at.blank? || !calendar_event.scheduled?

    if send_at <= Time.current
      EventReminderJob.perform_later(id)
    else
      EventReminderJob.set(wait_until: send_at).perform_later(id)
    end
  end
end
