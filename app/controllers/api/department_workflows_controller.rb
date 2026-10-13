require 'csv'

class Api::DepartmentWorkflowsController < Api::BaseController
  before_action do
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Vary'] = 'Cookie, Authorization'
  end
  before_action :limit_page_size
  before_action :set_department
  before_action :require_member!, except: [:requests, :create_request, :resolve_request]
  before_action :require_manager!, only: [:create_entry,:update_entry,:destroy_entry]
  rescue_from ActiveRecord::RecordInvalid do |error|
    render json:{error:error.record.errors.full_messages.join(', ')},status: :unprocessable_entity
  end
  rescue_from ActiveRecord::RecordNotUnique do
    render json:{error:'You already have a pending department request.'},status: :conflict
  end

  def entries
    scope = @department.department_entries.includes(:author).where(kind:params.fetch(:kind,'goal'))
    scope = scope.where('title ILIKE :term OR body ILIKE :term',term:"%#{ActiveRecord::Base.sanitize_sql_like(params[:q].to_s)}%") if params[:q].present?
    scope = scope.where(status:params[:status]) if params[:status].present?
    render_paginated_collection(scope.order(pinned: :desc,created_at: :desc,id: :desc),serializer:method(:entry_payload),per_page:25)
  end

  def create_entry
    entry = @department.department_entries.create!(entry_params.merge(author:current_user))
    render json:entry_payload(entry),status: :created
  end

  def update_entry
    entry = @department.department_entries.find(params[:entry_id])
    attributes = entry_params.except(:kind)
    raise ActionController::ParameterMissing,:lock_version unless attributes.key?(:lock_version)
    entry.update!(attributes)
    render json:entry_payload(entry)
  end

  def destroy_entry
    @department.department_entries.find(params[:entry_id]).destroy!
    head :no_content
  end

  def comments
    entry = @department.department_entries.find(params[:entry_id])
    render_paginated_collection(entry.department_comments.includes(:author).order(created_at: :desc,id: :desc),serializer:method(:comment_payload),per_page:25)
  end

  def create_comment
    entry = @department.department_entries.find(params[:entry_id])
    return head :unprocessable_entity unless entry.kind == 'announcement'
    comment = entry.department_comments.create!(author:current_user,body:params.require(:body))
    render json:comment_payload(comment),status: :created
  end

  def destroy_comment
    comment = @department.department_entries.find(params[:entry_id]).department_comments.find(params[:comment_id])
    return head :forbidden unless comment.author_id == current_user.id || Departments::Access.manage?(@department,current_user)
    comment.destroy!
    head :no_content
  end

  def requests
    scope = DepartmentJoinRequest.where('department_id = :id OR source_department_id = :id',id:@department.id).includes(:user,:department,:source_department)
    scope = scope.where(user:current_user) unless Departments::Access.head?(@department,current_user)
    render_paginated_collection(scope.order(created_at: :desc,id: :desc),serializer:method(:request_payload),per_page:25)
  end

  def create_request
    current_user.with_lock do
      return render json:{error:'You already belong to this department.'},status: :unprocessable_entity if current_user.department_id == @department.id
      return render json:{error:'Transfer your department head responsibility before requesting a move.'},status: :unprocessable_entity if Department.where(manager_id:current_user.id).exists?
      request = DepartmentJoinRequest.create!(department:@department,user:current_user,source_department_id:current_user.department_id,source_approved:current_user.department_id.nil?,reason:params[:reason])
      render json:request_payload(request),status: :created
    end
  end

  def resolve_request
    request = DepartmentJoinRequest.where('department_id = :id OR source_department_id = :id',id:@department.id).find(params[:request_id])
    action = params.require(:decision)
    request.with_lock do
      return render json:{error:'This request has already been resolved.'},status: :conflict unless request.status == 'pending'
      if action == 'cancel'
        return head :forbidden unless request.user_id == current_user.id
        request.update!(status:'cancelled',resolved_at:Time.current)
      else
        return head :forbidden unless Departments::Access.head?(@department,current_user)
        return render json:{error:'Choose approve, reject, or cancel.'},status: :unprocessable_entity unless %w[approve reject].include?(action)
        if action == 'reject'
          request.update!(status:'rejected',resolved_at:Time.current)
        else
          request.source_approved = true if request.source_department_id.nil? || Departments::Access.admin?(current_user) || request.source_department&.manager_id == current_user.id
          request.target_approved = true if Departments::Access.head?(request.department,current_user)
          request.source_approver = current_user if request.source_approved_changed? && request.source_department_id
          request.target_approver = current_user if request.target_approved_changed?
          if request.source_approved && request.target_approved
            request.user.with_lock do
              return render json:{error:'Membership changed. Cancel this request and submit a new one.'},status: :conflict unless request.user.department_id == request.source_department_id
              return render json:{error:'The requester must be active and transfer any head responsibility first.'},status: :unprocessable_entity if request.user.status != 'active' || request.user.deleted_at? || Department.where(manager_id:request.user_id).exists? || AccountDeletionRequest.where(user_id:request.user_id,status:'scheduled').exists?
              request.user.update!(department_id:request.department_id,department_role:'member')
              request.assign_attributes(status:'approved',resolved_at:Time.current)
              request.save!
            end
          else
            request.save!
          end
        end
      end
    end
    render json:request_payload(request.reload)
  end

  def report
    from = params[:from].present? ? Date.iso8601(params[:from]) : Date.current.beginning_of_month
    to = params[:to].present? ? Date.iso8601(params[:to]) : Date.current
    return render json:{error:'Choose a date range of at most 366 days.'},status: :unprocessable_entity if from > to || (to-from)>366
    dashboard = Departments::Dashboard.call(@department,current_user)
    tasks = Task.visible_to(current_user).where('COALESCE(assigned_to_user,developer_id) IN (?)',@department.users.pluck(:id))
    completed = tasks.where("LOWER(status) IN (?)",%w[done completed closed]).where(updated_at:from.beginning_of_day..to.end_of_day).count
    # Existing work logs are personal-only: department roles never expose other members' logs.
    minutes = current_user.work_logs.where(log_date:from..to).sum(:actual_minutes)
    projects = Project.accessible_to(current_user).where(id:ProjectUser.where(user_id:@department.users.select(:id),status:'active').select(:project_id))
    total = tasks.where(project_id:projects.select(:id)).group(:project_id).count
    done = tasks.where(project_id:projects.select(:id)).where("LOWER(status) IN (?)",%w[done completed closed]).group(:project_id).count
    rows = projects.order(:name).map{|project|{id:project.id,name:project.name,status:project.status,tasks:total.fetch(project.id,0),completed:done.fetch(project.id,0)}}
    csv = CSV.generate do |file|
      file << ['Project','Status','Assigned tasks','Completed tasks']
      rows.each{|row|file << row.values_at(:name,:status,:tasks,:completed).map{|value|value.is_a?(String) && value.match?(/\A[=+\-@\t\r]/) ? "'#{value}" : value}}
    end
    render json:{from:from,to:to,completed_tasks_in_period:completed,your_logged_hours:(minutes/60.0).round(2),projects:rows,dashboard:dashboard,csv:csv,scope:'Task completion uses last update date. Work-log hours include only your personal logs in the selected dates; project progress is a current snapshot of visible assigned tasks.'}
  rescue Date::Error
    render json:{error:'Use valid dates in YYYY-MM-DD format.'},status: :unprocessable_entity
  end

  private
  def limit_page_size
    params[:per_page] = params[:per_page].to_i.clamp(1,50) if params[:per_page].present?
  end
  def set_department = @department = Department.find(params[:department_id])
  def require_member!
    head :forbidden unless Departments::Access.member?(@department,current_user)
  end
  def require_manager!
    head :forbidden unless Departments::Access.manage?(@department,current_user)
  end
  def entry_params = params.require(:entry).permit(:kind,:title,:body,:url,:status,:progress,:due_date,:pinned,:lock_version)
  def entry_payload(entry)
    entry.as_json(only:%i[id kind title body url status progress due_date pinned lock_version created_at updated_at]).merge(author_name:entry.author&.full_name || 'Former member')
  end
  def comment_payload(comment)
    comment.as_json(only:%i[id body author_id created_at]).merge(author_name:comment.author&.full_name || 'Former member')
  end
  def request_payload(request)
    request.as_json(only:%i[id user_id department_id source_department_id reason status source_approved target_approved created_at resolved_at]).merge(user_name:request.user.full_name,department_name:request.department.name,source_department_name:request.source_department&.name)
  end
end
