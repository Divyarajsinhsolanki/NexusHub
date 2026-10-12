class Api::ScheduledChatMessagesController < Api::BaseController
  before_action :set_conversation
  def index
    scope = @conversation.scheduled_chat_messages.where(user: current_user, state: 'pending').with_attached_attachments.order(id: :desc)
    scope = scope.where('id < ?', params[:before_id].to_i) if params[:before_id].present?
    records = scope.limit(51).to_a
    has_more = records.size > 50
    records = records.first(50)
    render json: { data: records.reverse.map { |record| serialize(record) }, meta: { has_more: has_more, next_before_id: has_more ? records.last.id : nil } }
  end
  def create
    attributes = params.require(:message).permit(:body, :client_id, :reply_to_id, :send_at, attachments: [])
    existing = @conversation.scheduled_chat_messages.find_by(user: current_user, client_id: attributes[:client_id]) if attributes[:client_id].present?
    return render json: serialize(existing) if existing
    record = @conversation.scheduled_chat_messages.new(attributes)
    record.user = current_user
    if record.save
      # The persisted sweep also recovers sends after worker/Redis outages.
      ScheduledChatDeliveryJob.set(wait_until: record.send_at).perform_later(record.id)
      render json: serialize(record), status: :created
    else
      render json: { errors: record.errors.full_messages }, status: :unprocessable_entity
    end
  rescue ActiveRecord::RecordNotUnique
    render json: serialize(@conversation.scheduled_chat_messages.find_by!(user: current_user, client_id: attributes[:client_id]))
  end
  def destroy
    record = @conversation.scheduled_chat_messages.where(user: current_user).find(params[:id])
    record.with_lock do
      return render json: { errors: ['This message has already been sent'] }, status: :conflict if record.state == 'sent'
      record.update!(state: 'cancelled')
    end
    head :no_content
  end
  private
  def set_conversation
    @conversation = Conversation.for_user(current_user).find(params[:conversation_id])
  end
  def serialize(record)
    record.as_json(only: %i[id body send_at state reply_to_id client_id]).merge(attachment_count: record.attachments.size)
  end
end
