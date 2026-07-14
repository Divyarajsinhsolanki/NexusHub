class CallSessionTimeoutJob < ApplicationJob
  queue_as :default

  def perform(call_session_id)
    call_session = CallSession.unscoped.includes(:workspace, :initiator).find_by(id: call_session_id)
    return unless call_session

    Current.workspace = call_session.workspace
    Current.user = call_session.initiator

    Chat::CallManager.new(user: call_session.initiator).expire_unanswered(call_session)
  ensure
    Current.reset_all
  end
end
