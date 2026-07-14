module Chat
  class CallSerializer
    class << self
      def call(call_session, current_user: nil)
        call_session = call_session.reload unless call_session.association(:call_participants).loaded?
        current_participant = current_user ? call_session.participant_for(current_user) : nil

        {
          id: call_session.id,
          conversation_id: call_session.conversation_id,
          call_type: call_session.call_type,
          status: call_session.status,
          initiator_id: call_session.initiator_id,
          initiator_name: call_session.initiator.full_name,
          started_at: call_session.started_at,
          ended_at: call_session.ended_at,
          ended_reason: call_session.ended_reason,
          created_at: call_session.created_at,
          current_participant: serialize_participant(current_participant),
          participants: call_session.call_participants.map { |participant| serialize_participant(participant) }
        }
      end

      private

      def serialize_participant(participant)
        return nil unless participant

        {
          user_id: participant.user_id,
          name: participant.user.full_name,
          status: participant.status,
          ring_acknowledged_at: participant.ring_acknowledged_at,
          joined_at: participant.joined_at,
          left_at: participant.left_at
        }
      end
    end
  end
end
