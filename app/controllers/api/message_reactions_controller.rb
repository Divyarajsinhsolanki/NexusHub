class Api::MessageReactionsController < Api::BaseController
  before_action :set_message

  def create
    reaction = @message.message_reactions.find_or_initialize_by(user: current_user, emoji: reaction_params[:emoji])

    if reaction.persisted? || reaction.save
      render json: { reactions: serialize_reactions(@message), reacted_emojis: @message.reacted_emojis_for(current_user) }, status: :created
    else
      render json: { errors: reaction.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    reaction = @message.message_reactions.find_by(user: current_user, emoji: params[:emoji])
    reaction&.destroy

    render json: { reactions: serialize_reactions(@message), reacted_emojis: @message.reacted_emojis_for(current_user) }
  end

  private

  def set_message
    conversation = Conversation.for_user(current_user).find(params[:conversation_id])
    @message = conversation.messages.find(params[:message_id])
  end

  def reaction_params
    params.require(:message_reaction).permit(:emoji)
  end

  def serialize_reactions(message)
    message.reaction_counts.select { |_emoji, count| count.positive? }
  end
end
