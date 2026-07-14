class CallMailer < ApplicationMailer
  def missed_call(recipient, call_session)
    @recipient = recipient
    @call_session = call_session
    @conversation = Conversation.unscoped.find(call_session.conversation_id)
    @caller = User.unscoped.find(call_session.initiator_id)
    @conversation_name = conversation_name_for(@conversation, recipient)
    @chat_url = chat_url_for(call_session)

    mail(
      to: recipient.email,
      subject: "Missed #{call_session.call_type} call from #{@caller.full_name}"
    )
  end

  private

  def chat_url_for(call_session)
    path = "/chat/#{call_session.conversation_id}"
    default_options = Rails.application.routes.default_url_options
    host = default_options[:host].presence || "localhost:3000"
    protocol = default_options[:protocol].presence || "http"

    "#{protocol}://#{host}#{path}"
  end

  def conversation_name_for(conversation, recipient)
    return conversation.title if conversation.group?

    other_participant = User.unscoped
      .joins(:conversation_participants)
      .where(conversation_participants: { conversation_id: conversation.id })
      .where.not(id: recipient.id)
      .first

    other_participant&.full_name || "Direct chat"
  end
end
