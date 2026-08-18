class Api::UsersController < Api::BaseController
  include Rails.application.routes.url_helpers
  before_action :authorize_user_creation!, only: [:create]
  before_action :authorize_owner!, only: [:update, :destroy]
  before_action :set_user, only: [:show, :update, :destroy]

  ONLINE_WINDOW = 2.minutes

  # GET /api/users.json
  def index
    users = current_user.workspace.users
      .includes(:department, :roles, :projects, profile_picture_attachment: :blob, cover_photo_attachment: :blob)
      .order(created_at: :desc)
    render_paginated_collection(users, serializer: method(:serialize_user))
  end



  # GET /api/users/:id.json
  def show
    render json: serialize_user(@user)
  end

  # POST /api/users.json
  def create
    requested_role_names = normalized_role_names(params.dig(:user, :role_names))
    requested_project_ids = normalized_project_ids(params.dig(:user, :project_ids))

    validation_errors = []
    validation_errors.concat(role_selection_errors(requested_role_names))
    validation_errors.concat(project_selection_errors(requested_project_ids))

    if validation_errors.any?
      return render json: { errors: validation_errors.uniq }, status: :unprocessable_entity
    end

    @user = current_user.workspace.users.new(create_user_params)

    User.transaction do
      @user.save!
      assign_roles!(@user, requested_role_names) unless requested_role_names.nil?
      assign_projects!(@user, requested_project_ids) unless requested_project_ids.nil?
    end

    render json: serialize_user(@user.reload), status: :created
  rescue ActiveRecord::RecordInvalid => e
    errors = @user&.errors&.full_messages.presence || e.record.errors.full_messages.presence || [e.message]
    render json: { errors: errors.uniq }, status: :unprocessable_entity
  end

  # PATCH /api/users/:id.json
  def update
    role_names = params[:user].delete(:role_names) if params[:user]

    if @user.update(user_params)
      assign_roles!(@user, role_names) if role_names
      render json: serialize_user(@user)
    else
      render json: { errors: @user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # DELETE /api/users/:id.json
  def destroy
    @user.destroy
    head :no_content
  end

  # POST /api/users/presence
  def presence
    current_user.touch(:last_seen_at)
    online = current_user.last_seen_at.present? && current_user.last_seen_at >= ONLINE_WINDOW.ago

    ActionCable.server.broadcast("workspace_#{current_user.workspace_id}:presence", {
      user_id: current_user.id,
      last_seen_at: current_user.last_seen_at,
      online: online
    })

    render json: { ok: true, last_seen_at: current_user.last_seen_at, online: online }
  end

  # POST /api/update_profile
  def update_profile
    @user = current_user
    if @user.update(user_params)
      render json: @user
    else
      render json: { errors: @user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def set_user
    @user = current_user.workspace.users.find(params[:id] || params.dig(:user, :id))
  end

  def create_user_params
    params.require(:user).permit(
      :first_name,
      :last_name,
      :email,
      :password,
      :password_confirmation,
      :date_of_birth,
      :department_id,
      :job_title,
      :landing_page,
      :phone_number,
      :bio,
      social_links: {}
    )
  end

  def user_params
    params.require(:user).permit(
      :first_name,
      :last_name,
      :email,
      :date_of_birth,
      :profile_picture,
      :cover_photo,
      :color_theme,
      :avatar_color,
      :dark_mode,
      :landing_page,
      :job_title,
      :department_id,
      :phone_number,
      :bio,
      social_links: {},
      notification_preferences: {},
      push_notification_settings: [
        :enabled,
        :previews,
        { categories: {}, quiet_hours: [:enabled, :start, :end, :timezone, :allow_calls] }
      ]
    )
  end

  def normalized_role_names(raw_role_names)
    return nil if raw_role_names.nil?

    Array(raw_role_names).map(&:to_s).map(&:strip).reject(&:blank?).uniq
  end

  def normalized_project_ids(raw_project_ids)
    return nil if raw_project_ids.nil?

    Array(raw_project_ids).map(&:to_i).reject(&:zero?).uniq
  end

  def role_selection_errors(role_names)
    return [] if role_names.nil?

    errors = []
    unknown_roles = role_names - Role::NAMES
    forbidden_roles = role_names - assignable_role_names

    errors << "Unknown role selection: #{unknown_roles.join(', ')}" if unknown_roles.any?
    errors << "You are not allowed to assign: #{forbidden_roles.join(', ')}" if forbidden_roles.any?
    errors
  end

  def project_selection_errors(project_ids)
    return [] if project_ids.nil?

    existing_ids = Project.where(id: project_ids).pluck(:id)
    missing_ids = project_ids - existing_ids
    return [] if missing_ids.empty?

    ["Unknown project selection: #{missing_ids.join(', ')}"]
  end

  def assign_roles!(user, role_names)
    target_role_names = role_names.presence || ['member']
    user.roles = Role.where(name: target_role_names)
    user.remove_instance_variable(:@role_names) if user.instance_variable_defined?(:@role_names)
  end

  def assign_projects!(user, project_ids)
    if project_ids.empty?
      user.project_users.destroy_all
      return
    end

    user.project_users.where.not(project_id: project_ids).destroy_all

    project_ids.each do |project_id|
      user.project_users.find_or_create_by!(project_id: project_id)
    end
  end

  def assignable_role_names
    current_user&.owner? ? Role::NAMES : Role::NAMES - ['owner']
  end

  def serialize_user(user)
    {
      id: user.id,
      name: user.name,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      date_of_birth: user.date_of_birth,
      department_id: user.department_id,
      department_name: user.department&.name,
      job_title: user.job_title,
      profile_picture: user.profile_picture.attached? ?
        rails_blob_url(user.profile_picture, only_path: true) : nil,
      cover_photo: user.cover_photo.attached? ?
        rails_blob_url(user.cover_photo, only_path: true) : nil,
      avatar_color: user.avatar_color,
      roles: user.role_names.sort,
      landing_page: user.landing_page,
      phone_number: user.phone_number,
      bio: user.bio,
      social_links: user.social_links || {},
      projects: serialized_projects(user),
      last_seen_at: user.last_seen_at,
      online: user.last_seen_at.present? && user.last_seen_at >= ONLINE_WINDOW.ago
    }
  end

  def serialized_projects(user)
    projects = user.association(:projects).loaded? ? user.projects.sort_by { |project| project.name.to_s.downcase } : user.projects.order(:name)
    projects.map { |project| { id: project.id, name: project.name } }
  end

  def authorize_user_creation!
    head :forbidden unless current_user&.owner? || current_user&.admin?
  end

  def authorize_owner!
    head :forbidden unless current_user&.owner?
  end
end
