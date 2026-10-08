class Api::MessagesController < Api::BaseController
  DEFAULT_PAGE_SIZE = 50
  MAX_PAGE_SIZE = 100

  before_action :set_conversation

  def index
    response_time = Time.current.iso8601(6)
    limit = requested_limit
    scope = @conversation.messages
      .includes(:message_reactions, reply_to: [:user, :attachments_attachments], user: { profile_picture_attachment: :blob })
      .with_attached_attachments
      .order(id: :desc)
    if params[:updated_since].present?
      begin
        since = Time.iso8601(params[:updated_since].to_s)
      rescue ArgumentError
        return render json: { errors: ["Invalid sync timestamp"] }, status: :unprocessable_entity
      end
      messages = scope.reorder(id: :asc).where("messages.updated_at >= ?", since)
        .where("messages.id > ?", params[:after_id].to_i).limit(limit + 1).to_a
      has_more = messages.size > limit
      messages = messages.first(limit)
      return render json: { data: messages.map { |message| serialize_message(message) },
                            meta: { has_more: has_more, next_after_id: has_more ? messages.last.id : nil, server_time: response_time } }
    end
    if params[:around_id].present?
      target = @conversation.messages.find(params[:around_id])
      before = scope.where("messages.id <= ?", target.id).limit(limit / 2 + 1).to_a.reverse
      after = scope.reorder(id: :asc).where("messages.id > ?", target.id).limit((limit - 1) / 2).to_a
      return render json: {
        data: (before + after).map { |message| serialize_message(message) },
        meta: { has_more: @conversation.messages.where("id < ?", before.first.id).exists?,
                next_before_id: before.first.id, context: true, target_id: target.id }
      }
    end
    if params[:q].present?
      pattern = "%#{ActiveRecord::Base.sanitize_sql_like(params[:q].to_s.strip.first(200))}%"
      attachment_ids = ActiveStorage::Attachment.where(record_type: "Message", record_id: @conversation.messages.select(:id), name: "attachments")
        .joins(:blob).where("active_storage_blobs.filename ILIKE ?", pattern).select(:record_id)
      scope = scope.where(deleted_at: nil).where("messages.body ILIKE :q OR messages.id IN (:ids)", q: pattern, ids: attachment_ids)
    end
    scope = scope.where("messages.id < ?", params[:before_id].to_i) if params[:before_id].present?

    messages = scope.limit(limit + 1).to_a
    has_more = messages.length > limit
    messages = messages.first(limit)

    render json: {
      data: messages.reverse.map { |message| serialize_message(message) },
      meta: {
        has_more: has_more,
        next_before_id: has_more ? messages.last&.id : nil,
        server_time: response_time,
        per_page: limit
      }
    }
  end

  def create
    client_id = params.dig(:message, :client_id).presence
    if client_id
      existing = @conversation.messages.find_by(user: current_user, client_id: client_id)
      return render json: serialize_message(existing), status: :ok if existing
    end

    message = @conversation.messages.new(message_params)
    message.user = current_user
    if message.reply_to_id && !@conversation.messages.where(id: message.reply_to_id, message_type: 'message', deleted_at: nil).exists?
      return render json: { errors: ['Reply target must be a message in this conversation'] }, status: :unprocessable_entity
    end

    if message.save
      @conversation.touch
      Chat::ReceiptManager.new(user: current_user).update(
        conversation: @conversation,
        message_id: message.id,
        state: "read"
      )
      render json: serialize_message(message), status: :created
    else
      existing = @conversation.messages.find_by(user: current_user, client_id: client_id) if client_id
      return render json: serialize_message(existing), status: :ok if existing
      render json: { errors: message.errors.full_messages }, status: :unprocessable_entity
    end
  rescue ActiveRecord::RecordNotUnique
    existing = @conversation.messages.find_by!(user: current_user, client_id: client_id)
    render json: serialize_message(existing), status: :ok
  end

  def update
    mutate_message do |message|
      message.update!(body: params.require(:message).fetch(:body), edited_at: Time.current)
    end
  end

  def destroy
    mutate_message do |message|
      message.update!(body: "Message deleted", deleted_at: Time.current)
      message.attachments.detach
      message.message_reactions.delete_all
    end
  end

  private

  def mutate_message
    message = @conversation.messages.find(params[:id])
    message.with_lock do
      unless message.user_id == current_user.id && message.message_type == "message" &&
          !message.deleted_at? && Time.current < message.created_at + 15.minutes
        return render json: { errors: ["Only your own messages can be changed within 15 minutes of sending"] }, status: :forbidden
      end
      yield message
      Notification.where(notifiable: message).find_each do |notification|
        notification.update!(metadata: (notification.metadata || {}).merge("message_preview" => message.body.to_s.truncate(120)))
      end
    end
    Chat::Broadcaster.broadcast_message_changed(message.reload)
    render json: serialize_message(message)
  rescue ActiveRecord::RecordInvalid => error
    render json: { errors: error.record.errors.full_messages }, status: :unprocessable_entity
  end

  def set_conversation
    @conversation = Conversation.for_user(current_user).find(params[:conversation_id])
  end

  def message_params
    params.require(:message).permit(:body, :client_id, :reply_to_id, attachments: [])
  end

  def requested_limit
    limit = params[:limit].to_i
    limit = DEFAULT_PAGE_SIZE unless limit.positive?
    [limit, MAX_PAGE_SIZE].min
  end

  def serialize_message(message)
    message.chat_context.merge({
      id: message.id,
      client_id: message.client_id,
      body: message.body,
      user_id: message.user_id,
      user_name: message.user.full_name,
      user_profile_picture: message.user.profile_picture.attached? ? rails_blob_url(message.user.profile_picture, only_path: true) : nil,
      created_at: message.created_at,
      attachments: message.attachments.map { |attachment| { id: attachment.id, url: rails_blob_url(attachment, only_path: true), download_url: rails_blob_url(attachment, only_path: true, disposition: "attachment"), content_type: attachment.content_type, filename: attachment.filename.to_s, byte_size: attachment.byte_size } },
      reactions: message.reaction_counts,
      reacted_emojis: message.reacted_emojis_for(current_user)
    })
  end
end
