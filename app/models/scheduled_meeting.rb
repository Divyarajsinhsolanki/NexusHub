class ScheduledMeeting < ApplicationRecord
  include WorkspaceScoped
  belongs_to :organizer, class_name: 'User'
  belongs_to :call_session, optional: true
  has_many :meeting_invitations, dependent: :destroy
  has_many :notifications, as: :notifiable, dependent: :destroy
  validates :title, :starts_at, :ends_at, presence: true
  validates :title, length: {maximum: 120}
  validates :description, length: {maximum: 5000}
  validates :call_type, inclusion: {in: %w[audio video]}
  validates :status, inclusion: {in: %w[scheduled canceled completed]}
  validate do
    errors.add(:ends_at, 'must be after start and within 24 hours') if starts_at && ends_at && (ends_at <= starts_at || ends_at > starts_at + 24.hours)
  end
  scope :accessible_to, ->(user) {where(organizer_id: user.id).or(where(id: MeetingInvitation.where(user_id: user.id).select(:scheduled_meeting_id)))}
end
