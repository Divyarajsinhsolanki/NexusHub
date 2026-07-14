module Chat
  class CallManager
    class Error < StandardError; end
    class ActiveCallExists < Error; end
    class InvalidTransition < Error; end

    RING_TIMEOUT = 60.seconds

    def initialize(user:)
      @user = user
    end

    def create_call(conversation:, call_type:)
      normalized_call_type = call_type.to_s
      unless CallSession.call_types.key?(normalized_call_type)
        raise InvalidTransition, "Unsupported call type"
      end

      call_session = nil

      conversation.with_lock do
        if CallSession.live.where(conversation_id: conversation.id).exists?
          raise ActiveCallExists, "There is already an active call in this conversation"
        end

        call_session = conversation.call_sessions.create!(
          workspace: conversation.workspace,
          initiator: user,
          call_type: normalized_call_type,
          status: "ringing",
          livekit_room_name: livekit_room_name(conversation)
        )

        conversation.conversation_participants.includes(:user).find_each do |membership|
          status = membership.user_id == user.id ? "joined" : "ringing"
          call_session.call_participants.create!(
            workspace: conversation.workspace,
            user: membership.user,
            status: status,
            joined_at: (Time.current if status == "joined")
          )
        end
      end

      call_session = call_session.reload
      Chat::Broadcaster.broadcast_call_ringing(call_session)
      Chat::Broadcaster.broadcast_call_event(call_session, "call_started")
      CallSessionTimeoutJob.set(wait: RING_TIMEOUT).perform_later(call_session.id)
      call_session
    rescue ActiveRecord::RecordNotUnique
      raise ActiveCallExists, "There is already an active call in this conversation"
    end

    def acknowledge_ring(call_session)
      participant = participant_for!(call_session)
      return call_session unless participant.call_ringing?

      participant.update!(ring_acknowledged_at: Time.current)
      call_session
    end

    def join(call_session)
      participant = participant_for!(call_session)
      raise InvalidTransition, "This call has ended" unless call_session.live?
      raise InvalidTransition, "This call was declined" if participant.call_declined?

      started_now = false

      call_session.with_lock do
        call_session.reload
        participant.reload
        raise InvalidTransition, "This call has ended" unless call_session.live?

        participant.update!(
          status: "joined",
          joined_at: participant.joined_at || Time.current,
          left_at: nil,
          ring_acknowledged_at: participant.ring_acknowledged_at || Time.current
        )

        if call_session.call_ringing?
          call_session.update!(status: "active", started_at: call_session.started_at || Time.current)
          started_now = true
        end
      end

      call_session.reload
      Chat::Broadcaster.broadcast_call_event(call_session, "call_started") if started_now
      Chat::Broadcaster.broadcast_call_event(call_session, "call_participant_joined", user_id: user.id)
      call_session
    end

    def decline(call_session)
      participant = participant_for!(call_session)
      return call_session unless call_session.live?
      return call_session if participant.call_declined?

      call_session.with_lock do
        call_session.reload
        participant.reload
        return call_session unless call_session.live?

        participant.update!(status: "declined", left_at: Time.current)
        end_if_no_recipient_can_join!(call_session, "declined")
      end

      call_session.reload
      Chat::Broadcaster.broadcast_call_event(call_session, "call_participant_left", user_id: user.id)
      Chat::Broadcaster.broadcast_call_event(call_session, "call_ended") unless call_session.live?
      call_session
    end

    def leave(call_session)
      participant = participant_for!(call_session)
      return call_session unless call_session.live?

      call_session.with_lock do
        call_session.reload
        participant.reload
        return call_session unless call_session.live?

        participant.update!(status: "left", left_at: Time.current)
        end_call!(call_session, "ended", "left") unless joined_participants(call_session).exists?
      end

      call_session.reload
      Chat::Broadcaster.broadcast_call_event(call_session, "call_participant_left", user_id: user.id)
      Chat::Broadcaster.broadcast_call_event(call_session, "call_ended") unless call_session.live?
      call_session
    end

    def end_call(call_session, reason: "ended")
      participant_for!(call_session)
      return call_session unless call_session.live?

      call_session.with_lock do
        call_session.reload
        return call_session unless call_session.live?

        call_session.call_participants.where(status: "ringing").update_all(status: "missed", left_at: Time.current, updated_at: Time.current)
        call_session.call_participants.where(status: "joined").where.not(user_id: user.id).update_all(status: "left", left_at: Time.current, updated_at: Time.current)
        end_call!(call_session, reason == "canceled" ? "canceled" : "ended", reason)
      end

      call_session.reload
      Chat::Broadcaster.broadcast_call_event(call_session, "call_ended")
      call_session
    end

    def expire_unanswered(call_session)
      return call_session unless call_session.live?

      missed_participants = []

      call_session.with_lock do
        call_session.reload
        return call_session unless call_session.live?

        call_session.call_participants.where(status: "ringing").where.not(user_id: call_session.initiator_id).find_each do |participant|
          participant.update!(status: "missed", left_at: Time.current)
          missed_participants << participant
        end

        if joined_non_initiators(call_session).exists?
          call_session.update!(status: "active", started_at: call_session.started_at || Time.current) if call_session.call_ringing?
        else
          end_call!(call_session, "missed", "missed")
        end
      end

      call_session.reload
      missed_participants.each { |participant| notify_missed_call(call_session, participant) }
      Chat::Broadcaster.broadcast_call_event(call_session, "call_missed", user_ids: missed_participants.map(&:user_id)) if missed_participants.any?
      Chat::Broadcaster.broadcast_call_event(call_session, "call_ended") unless call_session.live?
      call_session
    end

    private

    attr_reader :user

    def participant_for!(call_session)
      participant = call_session.call_participants.find_by(user_id: user.id)
      raise InvalidTransition, "You are not a participant in this call" unless participant

      participant
    end

    def livekit_room_name(conversation)
      "workspace-#{conversation.workspace_id}-conversation-#{conversation.id}-#{SecureRandom.hex(8)}"
    end

    def joined_participants(call_session)
      call_session.call_participants.where(status: "joined")
    end

    def joined_non_initiators(call_session)
      joined_participants(call_session).where.not(user_id: call_session.initiator_id)
    end

    def end_if_no_recipient_can_join!(call_session, reason)
      return if joined_non_initiators(call_session).exists?
      return if call_session.call_participants.where(status: "ringing").where.not(user_id: call_session.initiator_id).exists?

      end_call!(call_session, reason == "declined" ? "canceled" : "ended", reason)
    end

    def end_call!(call_session, status, reason)
      call_session.update!(
        status: status,
        ended_reason: reason,
        ended_at: call_session.ended_at || Time.current
      )
    end

    def notify_missed_call(call_session, call_participant)
      membership = call_session.conversation.conversation_participants.find_by(user_id: call_participant.user_id)
      return if membership&.muted?

      notification = Notification.create(
        recipient: call_participant.user,
        actor: call_session.initiator,
        action: "missed_call",
        notifiable: call_session,
        metadata: {
          conversation_id: call_session.conversation_id,
          conversation_name: call_session.conversation.display_name(call_participant.user),
          call_session_id: call_session.id,
          call_type: call_session.call_type
        }
      )

      CallMailer.missed_call(call_participant.user, call_session).deliver_later if notification.persisted?
    end
  end
end
