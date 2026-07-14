class CallParticipant < ApplicationRecord
  include WorkspaceScoped

  enum :status, {
    ringing: "ringing",
    joined: "joined",
    declined: "declined",
    missed: "missed",
    left: "left"
  }, prefix: :call

  belongs_to :call_session
  belongs_to :user

  validates :user_id, uniqueness: { scope: :call_session_id }
  validates :status, presence: true
end
