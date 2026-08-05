module Chat
  class CallSerializer
    class << self
      def call(call_session, current_user: nil)
        call_session = call_session.reload unless call_session.association(:call_participants).loaded?
        current_participant = current_user ? call_session.participant_for(current_user) : nil

        {
          id: call_session.id,
          public_id: call_session.public_id,
          share_url: share_url(call_session),
          conversation_id: call_session.conversation_id,
          call_type: call_session.call_type,
          status: call_session.status,
          initiator_id: call_session.initiator_id,
          initiator_name: call_session.initiator.full_name,
          started_at: call_session.started_at,
          ended_at: call_session.ended_at,
          ended_reason: call_session.ended_reason,
          created_at: call_session.created_at,
          can_end: current_user.present? && current_user.id == call_session.initiator_id,
          current_participant: serialize_participant(current_participant),
          participants: call_session.call_participants.map { |participant| serialize_participant(participant) }
        }
      end

      private

      def share_url(call_session)
        base_url = ENV["FRONTEND_URL"].presence || ENV["BASE_URL"].presence
        base_url ||= begin
          options = Rails.application.routes.default_url_options
          protocol = options[:protocol].presence || "http"
          host = options[:host].presence || "localhost:3000"
          "#{protocol}://#{host}"
        end

        "#{base_url.to_s.delete_suffix('/')}/meet/#{call_session.public_id}"
      end

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
