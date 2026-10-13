# Keeps the authentication lifecycle connected even outside chat screens.
class SessionChannel < ApplicationCable::Channel
  periodically :check_session, every: 30.seconds

  def subscribed
    check_session
  end

  private

  def check_session
    connection.close(reason: "session_revoked", reconnect: false) unless connection.session_valid?
  end
end
