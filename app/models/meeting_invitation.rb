class MeetingInvitation < ApplicationRecord
  include WorkspaceScoped
  belongs_to :scheduled_meeting
  belongs_to :user
  belongs_to :calendar_event, optional: true
  validates :response, inclusion: {in: %w[invited accepted declined]}
  validates :user_id, uniqueness: {scope: :scheduled_meeting_id}
  before_destroy { calendar_event&.destroy! }
end
