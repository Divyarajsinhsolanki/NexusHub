class Api::EventRemindersController < Api::BaseController
  before_action :set_calendar_event, only: [:create]
  before_action :set_event_reminder, only: [:update, :destroy]
  before_action :authorize_event_edit!
  before_action :reject_managed_operation

  def create
    reminder = @calendar_event.event_reminders.new(event_reminder_params)

    if reminder.save
      render json: reminder.as_json(only: [:id, :calendar_event_id, :channel, :minutes_before, :send_at, :sent_at, :state]), status: :created
    else
      render json: { errors: reminder.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @event_reminder.update(event_reminder_params)
      render json: @event_reminder.as_json(only: [:id, :calendar_event_id, :channel, :minutes_before, :send_at, :sent_at, :state])
    else
      render json: { errors: @event_reminder.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @event_reminder.destroy
    head :no_content
  end

  private

  def reject_managed_operation
    event = @calendar_event || @event_reminder&.calendar_event
    return unless event&.managed_operation?

    render json: { error: 'Manage these reminders in Project Environments.' }, status: :unprocessable_entity
  end

  def set_calendar_event
    @calendar_event = accessible_events.find(params[:calendar_event_id])
  end

  def set_event_reminder
    @event_reminder = EventReminder.joins(:calendar_event)
                                   .where(calendar_event: accessible_events)
                                   .find(params[:id])
  end

  def accessible_events
    CalendarEvent.accessible_to(current_user)
  end

  def authorize_event_edit!
    event = @calendar_event || @event_reminder.calendar_event
    head :forbidden unless event.editable_by?(current_user)
  end

  def event_reminder_params
    params.require(:event_reminder).permit(:channel, :minutes_before)
  end
end
