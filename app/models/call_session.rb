class CallSession < ApplicationRecord
  include WorkspaceScoped

  LIVE_STATUSES = %w[ringing active].freeze

  enum :call_type, { audio: "audio", video: "video" }, prefix: :call
  enum :status, {
    ringing: "ringing",
    active: "active",
    ended: "ended",
    missed: "missed",
    canceled: "canceled",
    failed: "failed"
  }, prefix: :call

  belongs_to :conversation
  belongs_to :initiator, class_name: "User"
  has_many :call_participants, dependent: :destroy
  has_many :participants, through: :call_participants, source: :user

  before_validation :ensure_public_id, on: :create

  validates :call_type, :status, :livekit_room_name, :public_id, presence: true
  validates :livekit_room_name, uniqueness: true
  validates :public_id, uniqueness: true

  scope :live, -> { where(status: LIVE_STATUSES) }
  scope :recent, -> { order(created_at: :desc) }

  def live?
    LIVE_STATUSES.include?(status)
  end

  def participant_for(user)
    call_participants.find { |participant| participant.user_id == user.id } ||
      call_participants.find_by(user_id: user.id)
  end

  private

  def ensure_public_id
    self.public_id ||= SecureRandom.uuid
  end
end
