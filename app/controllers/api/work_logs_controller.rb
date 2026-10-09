class Api::WorkLogsController < Api::BaseController
  before_action :set_work_log, only: [:update, :destroy]

  def index
    logs = current_user.work_logs.includes(:category, :priority, :tags)
    logs = logs.where(log_date: params[:date]) if params[:date].present?
    if params[:from].present? && params[:to].present?
      logs = logs.where(log_date: params[:from]..params[:to])
    end
    render_paginated_collection(logs.order(log_date: :desc), serializer: method(:serialize_log))
  end

  def create
    log = current_user.work_logs.new
    log.save_with_tags!(work_log_params)
    render json: serialize_log(log), status: :created
  rescue ActiveRecord::RecordInvalid => error
    render json: { errors: error.record.errors.full_messages }, status: :unprocessable_entity
  end

  def update
    @work_log.save_with_tags!(work_log_params)
    render json: serialize_log(@work_log)
  rescue ActiveRecord::RecordInvalid => error
    render json: { errors: error.record.errors.full_messages }, status: :unprocessable_entity
  end

  def destroy
    @work_log.destroy
    head :no_content
  end

  private

  def set_work_log
    @work_log = current_user.work_logs.find(params[:id])
  end

  def work_log_params
    params.require(:work_log).permit(
      :title,
      :description,
      :log_date,
      :start_time,
      :end_time,
      :category_id,
      :priority_id,
      :actual_minutes,
      tags: []
    )
  end

  def serialize_log(log)
    log.as_json(include: {
      category: { only: [:id, :name, :color, :hex] },
      priority: { only: [:id, :name, :color, :hex] },
      tags: { only: [:id, :name] }
    }).merge(
      "start_time" => log.start_time&.strftime("%H:%M"),
      "end_time" => log.end_time&.strftime("%H:%M")
    )
  end
end
