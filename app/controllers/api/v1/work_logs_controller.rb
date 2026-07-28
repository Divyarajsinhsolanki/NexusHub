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
    work_log = current_user.work_logs.new(work_log_attributes)
    assign_tags(work_log)
    return render_validation_error(work_log) unless work_log.save

    render_data(serialize_work_log(work_log), status: :created)
  end

  def update
    @work_log.assign_attributes(work_log_attributes)
    assign_tags(@work_log)
    return render_validation_error(@work_log) unless @work_log.save

    render_data(serialize_work_log(@work_log))
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

  def work_log_attributes
    permitted_work_log.except(:tags)
  end

  def assign_tags(work_log)
    names = Array(permitted_work_log[:tags]).filter_map { |name| name.to_s.strip.presence }.uniq
    work_log.tags = names.map { |name| WorkTag.find_or_create_by!(name: name) }
  end
end
