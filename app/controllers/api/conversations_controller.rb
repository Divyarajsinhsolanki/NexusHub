class Api::ConversationsController < Api::BaseController
  CONVERSATION_PAGE_SIZE = 30
  MAX_CONVERSATION_PAGE_SIZE = 100

  before_action :set_conversation, only: [:show, :summary, :destroy, :for_everyone, :mute, :unmute]

  def index
    base_scope = Conversation.for_user(current_user)
    scope = base_scope
      .includes(:last_message, :conversation_participants, participants: { profile_picture_attachment: :blob })
      .order(updated_at: :desc)

    if paginated_conversations_request?
      page = conversation_page
      per_page = conversations_per_page
      all_conversation_ids = base_scope.pluck(:id)
      conversation_type_counts = base_scope.group(:conversation_type).count
      total_count = all_conversation_ids.length
      total_pages = (total_count.to_f / per_page).ceil
      conversations = scope.limit(per_page).offset((page - 1) * per_page).to_a

      render json: {
        data: serialize_conversation_collection(conversations),
        meta: {
          current_page: page,
          next_page: page < total_pages ? page + 1 : nil,
          prev_page: page > 1 && total_pages.positive? ? page - 1 : nil,
          total_pages: total_pages,
          total_count: total_count,
          per_page: per_page,
          unread_count: unread_counts_for(all_conversation_ids).values.sum,
          conversation_counts: {
            direct: conversation_type_counts['direct'] || 0,
            group: conversation_type_counts['group'] || 0
          }
        }
      }
      return
    end

    render json: serialize_conversation_collection(scope.to_a)
  end

  def show
    participant = @conversation.conversation_participants.find_by(user_id: current_user.id)
    if !current_user.demo_account? && participant&.update(last_read_at: Time.current)
      Chat::Broadcaster.broadcast_message_read(
        current_user.workspace_id,
        @conversation.id,
        current_user.id
      )
    end

    render json: serialize_conversation(@conversation, include_messages: true)
  end

  def summary
    render json: serialize_conversation(@conversation)
  end

  def create
    conversation = Conversation.new(conversation_params.merge(creator: current_user))

    participant_ids = Array(params[:participant_ids]).map(&:to_i).uniq
    participant_ids << current_user.id

    if conversation.save
      participant_ids.each do |user_id|
        conversation.conversation_participants.create!(user_id: user_id)
      end
      Chat::Broadcaster.broadcast_conversation_refresh(conversation)
      render json: serialize_conversation(conversation), status: :created
    else
      render json: { errors: conversation.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def start_direct
    other_user = current_user.workspace.users.find(params[:user_id])
    conversation = find_or_create_direct_conversation(other_user)

    render json: serialize_conversation(conversation)
  end

  def destroy
    membership = @conversation.conversation_participants.find_by!(user_id: current_user.id)
    membership.update!(hidden_at: Time.current, last_read_at: Time.current)
    Chat::Broadcaster.broadcast_conversation_hidden(@conversation, current_user.id)

    render json: { success: true, conversation_id: @conversation.id }
  end

  def for_everyone
    unless can_delete_for_everyone?(@conversation)
      head :forbidden
      return
    end

    unless delete_confirmation_matches?(@conversation)
      render json: { error: "confirmation_required", confirmation: delete_confirmation_text(@conversation) }, status: :unprocessable_entity
      return
    end

    workspace_id = @conversation.workspace_id
    conversation_id = @conversation.id
    participant_ids = @conversation.participant_ids

    Conversation.transaction do
      @conversation.update_columns(last_message_id: nil, last_message_at: nil)
      delete_chat_notifications(@conversation)
      @conversation.messages.destroy_all
      @conversation.conversation_participants.delete_all
      @conversation.destroy!
    end

    Chat::Broadcaster.broadcast_conversation_deleted(workspace_id, conversation_id, participant_ids)

    render json: { success: true, conversation_id: conversation_id }
  end

  def mute
    membership = @conversation.conversation_participants.find_by!(user_id: current_user.id)
    membership.mute!(mute_until_from_params)
    Chat::Broadcaster.broadcast_conversation_refresh(@conversation)

    render json: serialize_conversation(@conversation.reload)
  end

  def unmute
    membership = @conversation.conversation_participants.find_by!(user_id: current_user.id)
    membership.unmute!
    Chat::Broadcaster.broadcast_conversation_refresh(@conversation)

    render json: serialize_conversation(@conversation.reload)
  end

  private

  def set_conversation
    @conversation = Conversation.for_user(current_user)
      .includes(:last_message, :conversation_participants, participants: { profile_picture_attachment: :blob })
      .find(params[:id])
  end

  def conversation_params
    params.require(:conversation).permit(:title, :conversation_type)
  end

  def find_or_create_direct_conversation(other_user)
    candidate = Conversation.conversation_direct
      .where(workspace_id: current_user.workspace_id)
      .joins(:conversation_participants)
      .where(conversation_participants: { user_id: [current_user.id, other_user.id] })
      .group("conversations.id")
      .having("COUNT(DISTINCT conversation_participants.user_id) = 2")
      .first

    if candidate
      restore_current_membership(candidate)
      return candidate
    end

    conversation = Conversation.create!(conversation_type: :direct, creator: current_user)
    conversation.conversation_participants.create!(user: current_user)
    conversation.conversation_participants.create!(user: other_user)
    Chat::Broadcaster.broadcast_conversation_refresh(conversation)
    conversation
  end

  def paginated_conversations_request?
    params[:page].present? || params[:per_page].present?
  end

  def conversation_page
    page = params[:page].to_i
    page.positive? ? page : 1
  end

  def conversations_per_page
    per_page = params[:per_page].to_i
    per_page = CONVERSATION_PAGE_SIZE unless per_page.positive?
    [per_page, MAX_CONVERSATION_PAGE_SIZE].min
  end

  def serialize_conversation_collection(conversations)
    conversation_ids = conversations.map(&:id)
    unread_counts = unread_counts_for(conversation_ids)

    conversations.map do |conversation|
      serialize_conversation(
        conversation,
        unread_count: unread_counts[conversation.id] || 0,
        last_message: conversation.last_message,
        last_message_at: conversation.last_message_at,
        last_message_loaded: true
      )
    end
  end

  def latest_message_times_for(conversation_ids)
    return {} if conversation_ids.empty?

    Message.where(conversation_id: conversation_ids).group(:conversation_id).maximum(:created_at)
  end

  def latest_messages_for(conversation_ids, last_message_at_by_conversation)
    return {} if conversation_ids.empty? || last_message_at_by_conversation.empty?

    Message
      .where(conversation_id: conversation_ids, created_at: last_message_at_by_conversation.values)
      .with_attached_attachments
      .to_a
      .group_by(&:conversation_id)
      .transform_values do |messages|
        messages.max_by { |message| [message.created_at || Time.at(0), message.id || 0] }
      end
  end

  def unread_counts_for(conversation_ids)
    return {} if conversation_ids.empty?

    Message
      .joins('INNER JOIN conversation_participants current_memberships ON current_memberships.conversation_id = messages.conversation_id')
      .where(conversation_id: conversation_ids)
      .where('current_memberships.user_id = ?', current_user.id)
      .where('current_memberships.hidden_at IS NULL')
      .where.not(user_id: current_user.id)
      .where('messages.created_at > COALESCE(current_memberships.last_read_at, ?)', Time.at(0))
      .group('messages.conversation_id')
      .count
  end

  def restore_current_membership(conversation)
    membership = conversation.conversation_participants.find_by(user_id: current_user.id)
    return unless membership&.hidden_at?

    membership.update!(hidden_at: nil)
    Chat::Broadcaster.broadcast_conversation_refresh(conversation)
  end

  def can_delete_for_everyone?(conversation)
    conversation.creator_id == current_user.id || current_user.owner? || current_user.admin?
  end

  def delete_confirmation_text(conversation)
    "DELETE #{conversation.id}"
  end

  def delete_confirmation_matches?(conversation)
    confirmation = params[:confirmation].presence || params[:confirm].presence
    confirmation.to_s == delete_confirmation_text(conversation)
  end

  def delete_chat_notifications(conversation)
    message_ids = conversation.messages.pluck(:id)
    reaction_ids = MessageReaction.where(message_id: message_ids).pluck(:id)

    Notification.where(notifiable_type: "Message", notifiable_id: message_ids).delete_all if message_ids.any?
    Notification.where(notifiable_type: "MessageReaction", notifiable_id: reaction_ids).delete_all if reaction_ids.any?
    Notification.where("metadata ->> 'conversation_id' = ?", conversation.id.to_s).delete_all
  end

  def conversation_display_name(conversation)
    return conversation.title if conversation.group?

    other_participant = conversation.participants.find { |participant| participant.id != current_user.id }
    other_participant&.full_name || 'Direct chat'
  end

  def mute_until_from_params
    value = params[:muted_until].presence || params.dig(:conversation, :muted_until).presence
    return Time.zone.parse(value) if value.present?

    duration = (params[:duration].presence || params.dig(:conversation, :duration).presence || "forever").to_s
    case duration
    when "1h", "hour", "one_hour"
      1.hour.from_now
    when "8h", "workday", "eight_hours"
      8.hours.from_now
    when "1w", "week", "one_week"
      1.week.from_now
    else
      nil
    end
  rescue ArgumentError
    nil
  end

  def serialize_conversation(conversation, include_messages: false, unread_count: nil, last_message: nil, last_message_at: nil, last_message_loaded: false)
    membership = conversation.conversation_participants.find { |cp| cp.user_id == current_user.id } || conversation.conversation_participants.find_by(user_id: current_user.id)
    unread_count = conversation.messages.where("messages.created_at > ?", membership&.last_read_at || Time.at(0)).where.not(user_id: current_user.id).count if unread_count.nil?
    active_call = CallSession.live
      .includes(:initiator, call_participants: :user)
      .where(conversation_id: conversation.id)
      .recent
      .first
    payload = {
      id: conversation.id,
      title: conversation_display_name(conversation),
      conversation_type: conversation.conversation_type,
      creator_id: conversation.creator_id,
      can_delete_for_everyone: can_delete_for_everyone?(conversation),
      hidden_at: membership&.hidden_at,
      muted_at: membership&.muted_at,
      muted_until: membership&.muted_until,
      muted: membership&.muted? || false,
      active_call: active_call ? Chat::CallSerializer.call(active_call, current_user: current_user) : nil,
      participants: conversation.participants.map do |user|
        participant = conversation.conversation_participants.find { |cp| cp.user_id == user.id } || conversation.conversation_participants.find_by(user_id: user.id)
        {
          id: user.id,
          name: user.full_name,
          profile_picture: (rails_blob_url(user.profile_picture, only_path: true) if user.profile_picture.attached?),
          last_seen_at: user.last_seen_at,
          last_read_at: participant&.last_read_at,
          online: user.last_seen_at.present? && user.last_seen_at >= 2.minutes.ago
        }
      end,
      unread_count: unread_count,
      last_message_at: last_message_at || conversation.last_message_at || conversation.messages.maximum(:created_at),
      updated_at: conversation.updated_at
    }

    if include_messages
      message_page = conversation.messages
        .includes(:message_reactions, user: { profile_picture_attachment: :blob })
        .with_attached_attachments
        .order(id: :desc)
        .limit(Api::MessagesController::DEFAULT_PAGE_SIZE + 1)
        .to_a
      has_more_messages = message_page.length > Api::MessagesController::DEFAULT_PAGE_SIZE
      message_page = message_page.first(Api::MessagesController::DEFAULT_PAGE_SIZE)
      payload[:messages] = message_page.reverse.map { |message| serialize_message(message) }
      payload[:messages_meta] = {
        has_more: has_more_messages,
        next_before_id: has_more_messages ? message_page.last&.id : nil,
        per_page: Api::MessagesController::DEFAULT_PAGE_SIZE
      }
    end

    last_message = conversation.last_message || conversation.messages.order(created_at: :desc, id: :desc).first unless last_message_loaded
    payload[:last_message] = last_message&.body.presence || (last_message&.attachments&.attached? ? "Sent an attachment" : nil)

    payload
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
