class Api::DepartmentsController < Api::BaseController
  before_action :set_department, only: [:show, :update, :destroy, :members, :update_members, :update_role]
  before_action :authorize_admin!, only: [:create, :update, :destroy]

  before_action :authorize_membership!, only: [:update_members]
  before_action :authorize_roles!, only: [:update_role]

  def index
    departments = Department.includes(:users, manager: { profile_picture_attachment: :blob }).order(:name)

    render json: departments.map { |department| serialize_department(department) }
  end

  def show
    render json: serialize_department(@department, include_members: true)
  end

  def create
    department = Department.new(department_params)

    if department.save
      render json: serialize_department(department), status: :created
    else
      render json: { errors: department.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @department.update(department_params)
      render json: serialize_department(@department)
    else
      render json: { errors: @department.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @department.destroy
    head :no_content
  end

  def members
    render json: {
      department: serialize_department(@department),
      users: serialized_users(@department.users.order(:first_name, :last_name, :email))
    }
  end

  def update_members
    user_ids = Array(params[:user_ids]).map(&:to_i).uniq

    selected = current_user.workspace.users.where(id: user_ids)
    return render json: { error: 'Choose users from this workspace.' }, status: :unprocessable_entity unless selected.count == user_ids.size
    @department.with_lock do
      # Managers can assign previously unassigned users; moving departments requires a head/admin.
      if !can_manage_roles? && selected.where.not(department_id: [nil, @department.id]).exists?
        return render json: { error: 'Only a department head or administrator can move members between departments.' }, status: :forbidden
      end
      @department.users.where.not(id: user_ids).update_all(department_id: nil, department_role: 'member')
      selected.where.not(department_id: @department.id).or(selected.where(department_id: nil)).update_all(department_id: @department.id, department_role: 'member')
    end

    @department.reload

    render json: {
      department: serialize_department(@department),
      users: serialized_users(@department.users.order(:first_name, :last_name, :email)),
      message: "Department members updated successfully."
    }
  end

  def update_role
    role = params[:role]
    return render json: { error: 'Choose member or manager.' }, status: :unprocessable_entity unless %w[member manager].include?(role)
    @department.with_lock do
      member = @department.users.find(params[:user_id])
      return render json: { error: 'The department head is assigned separately.' }, status: :unprocessable_entity if member.id == @department.manager_id
      member.update!(department_role: role)
    end
    render json: serialize_department(@department, include_members: true)
  end

  private

  def can_manage_roles?
    current_user.admin? || current_user.owner? || @department&.manager_id == current_user.id
  end

  def authorize_roles!
    head :forbidden unless can_manage_roles?
  end

  def authorize_membership!
    head :forbidden unless can_manage_roles? || (@department.users.exists?(id: current_user.id, department_role: 'manager'))
  end

  def set_department
    @department = Department.includes(manager: { profile_picture_attachment: :blob }).find(params[:id])
  end

  def department_params
    params.require(:department).permit(:name, :description, :manager_id)
  end

  def serialize_department(department, include_members: false)
    payload = {
      id: department.id,
      name: department.name,
      users_count: department.users.size,
      updated_at: department.updated_at,
      description: department.description,
      manager_id: department.manager_id,
      manager: department.manager ? { id: department.manager.id, full_name: department.manager.full_name, profile_picture_url: department.manager.profile_picture.attached? ? Rails.application.routes.url_helpers.rails_blob_url(department.manager.profile_picture, only_path: true) : nil } : nil,
      members_preview: serialized_users(department.users.order(:first_name, :last_name).limit(5))
    }
    
    if include_members
      payload[:members] = serialized_users(department.users.order(:first_name, :last_name, :email))
      payload[:dashboard] = Departments::Dashboard.call(department, current_user)
      payload[:capabilities] = { view_content: Departments::Access.member?(department,current_user), manage_content: Departments::Access.manage?(department,current_user), approve_requests: Departments::Access.head?(department,current_user), manage_roles: can_manage_roles?, manage_members: can_manage_roles? || department.users.exists?(id: current_user.id, department_role: 'manager') }
    end
    payload
  end

  def serialized_users(users)
    users.includes(profile_picture_attachment: :blob).map do |user|
      {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        job_title: user.job_title,
        department_id: user.department_id,
        department_role: user.department_role,
        full_name: user.full_name,
        phone: user.phone_number,
        profile_picture_url: user.profile_picture.attached? ? Rails.application.routes.url_helpers.rails_blob_url(user.profile_picture, only_path: true) : nil
      }
    end
  end

  def authorize_admin!
    head :forbidden unless current_user&.admin? || current_user&.owner?
  end
end
