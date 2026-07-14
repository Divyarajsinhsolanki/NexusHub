class Api::MessagesController < Api::BaseController
  DEFAULT_PAGE_SIZE = 50
  MAX_PAGE_SIZE = 100

  before_action :set_conversation

  def index
    limit = requested_limit
    scope = @conversation.messages
      .includes(:message_reactions, user: { profile_picture_attachment: :blob })
      .with_attached_attachments
      .order(id: :desc)
    scope = scope.where("messages.id < ?", params[:before_id].to_i) if params[:before_id].present?

    messages = scope.limit(limit + 1).to_a
    has_more = messages.length > limit
    messages = messages.first(limit)

    render json: {
      data: messages.reverse.map { |message| serialize_message(message) },
      meta: {
        has_more: has_more,
        next_before_id: has_more ? messages.last&.id : nil,
        per_page: limit
      }
    }
  end

  def create
    message = @conversation.messages.new(message_params)
    message.user = current_user

    if message.save
      @conversation.touch
      @conversation.conversation_participants.where(user_id: current_user.id).update_all(last_read_at: Time.current)
      Chat::Broadcaster.broadcast_message_read(
        current_user.workspace_id,
        @conversation.id,
        current_user.id
      )
      render json: serialize_message(message), status: :created
    else
      render json: { errors: message.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def set_conversation
    @conversation = Conversation.for_user(current_user).find(params[:conversation_id])
  end

  def message_params
    params.require(:message).permit(:body, attachments: [])
  end

  def requested_limit
    limit = params[:limit].to_i
    limit = DEFAULT_PAGE_SIZE unless limit.positive?
    [limit, MAX_PAGE_SIZE].min
  end

  def serialize_message(message)
    {
      id: message.id,
      body: message.body,
      user_id: message.user_id,
      user_name: message.user.full_name,
      user_profile_picture: message.user.profile_picture.attached? ? rails_blob_url(message.user.profile_picture, only_path: true) : nil,
      created_at: message.created_at,
      attachments: message.attachments.map { |attachment| { id: attachment.id, url: rails_blob_url(attachment, only_path: true), download_url: rails_blob_url(attachment, only_path: true, disposition: "attachment"), content_type: attachment.content_type, filename: attachment.filename.to_s, byte_size: attachment.byte_size } },
      reactions: message.reaction_counts,
      reacted_emojis: message.reacted_emojis_for(current_user)
    }
  end
end
