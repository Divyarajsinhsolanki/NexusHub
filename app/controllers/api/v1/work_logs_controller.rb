class Api::V1::WorkLogsController < Api::V1::BaseController
  before_action :set_work_log, only: [:update, :destroy]

  def index
    logs = current_user.work_logs.includes(:category, :priority, :tags)
    logs = logs.where(log_date: params[:date]) if params[:date].present?
    if params[:from].present? && params[:to].present?
      logs = logs.where(log_date: params[:from]..params[:to])
    end

    render_paginated_data(logs.order(log_date: :desc, start_time: :desc), serializer: method(:serialize_work_log))
  end

  def create
    work_log = current_user.work_logs.new
    work_log.save_with_tags!(permitted_work_log)
    render_data(serialize_work_log(work_log), status: :created)
  rescue ActiveRecord::RecordInvalid => error
    render_validation_error(error.record)
  end

  def update
    @work_log.save_with_tags!(permitted_work_log)
    render_data(serialize_work_log(@work_log))
  rescue ActiveRecord::RecordInvalid => error
    render_validation_error(error.record)
  end

  def destroy
    @work_log.destroy!
    render_data({ deleted: true })
  end

  private

  def set_work_log
    @work_log = current_user.work_logs.find(params[:id])
  end

  def permitted_work_log
    @permitted_work_log ||= params.require(:work_log).permit(
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

end
