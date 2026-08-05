class CallParticipant < ApplicationRecord
  enum :status, {
    ringing: "ringing",
    joined: "joined",
    declined: "declined",
    missed: "missed",
    left: "left"
  }, prefix: :call

  belongs_to :call_session
  belongs_to :user
  belongs_to :workspace

  validates :user_id, uniqueness: { scope: :call_session_id }
  validates :status, presence: true
  validate :workspace_matches_call_session

  before_validation :assign_call_workspace, on: :create

  private

  def assign_call_workspace
    self.workspace ||= call_session&.workspace
  end

  def workspace_matches_call_session
    return if workspace_id.blank? || call_session.blank? || workspace_id == call_session.workspace_id

    errors.add(:workspace, "must match the call workspace")
  end
end
