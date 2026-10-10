class Api::AdminController < Api::BaseController
  before_action :authorize_admin_access!
  before_action :set_model, except: [:tables, :reset_user_password]
  rescue_from ActiveRecord::RecordInvalid do |error|
    render json: { errors: error.record.errors.full_messages }, status: :unprocessable_entity
  end
  
  def tables
    render json: admin_model_names
  end

  def meta
    columns = @model.columns.reject { |column| hidden_admin_column?(column) }.map do |c|
      {
        name: c.name,
        type: c.type,
        null: c.null,
        default: c.default
      }
    end
    render json: columns
  end

  def index
    page = params[:page].to_i.positive? ? params[:page].to_i : 1
    per_page = params[:per_page].to_i.positive? ? [params[:per_page].to_i, 100].min : 20

    records = admin_records.order(id: :desc)

    filters = filter_params
    records = records.where(filters) if filters.present?
    if params[:q].present?
      columns = @model.columns.reject { |column| hidden_admin_column?(column) }
      if params[:search_column].present?
        columns = columns.select { |column| column.name == params[:search_column] }
        return render json: { error: "Invalid search column" }, status: :unprocessable_entity if columns.empty?
      end
      connection = @model.connection
      table = connection.quote_table_name(@model.table_name)
      predicates = columns.map do |column|
        "CAST(#{table}.#{connection.quote_column_name(column.name)} AS TEXT) ILIKE :query"
      end
      query = "%#{ActiveRecord::Base.sanitize_sql_like(params[:q].to_s.first(200))}%"
      records = records.where(predicates.join(" OR "), query: query) if predicates.any?
    end

    total_count = records.count
    records = records.offset((page - 1) * per_page).limit(per_page)

    json_records = records.map do |record|
      data = record.serializable_hash(except: serialization_excludes_for(record))

      if record.respond_to?(:image) && record.image.attached?
        data[:image_url] = url_for(record.image)
      end

      data[:admin_permissions] = { update: record_mutation_allowed?(record), destroy: record_mutation_allowed?(record), password_reset: record.is_a?(User) && password_reset_allowed?(record) }
      data
    end

    render json: {
      permissions: { create: @model != User && record_mutation_allowed?(@model.new) },
      records: json_records,
      pagination: {
        current_page: page,
        per_page: per_page,
        total_pages: (total_count / per_page.to_f).ceil,
        total_count: total_count
      }
    }
  end

  def create
    record = admin_records.new(record_params)
    return head :forbidden unless record_mutation_allowed?(record)
    return reject_managed_record if managed_record?(record)
    record.save!
    render json: serialize_record(record)
  end
  
  def update
    record = admin_records.find(params[:id])
    return head :forbidden unless record_mutation_allowed?(record)
    record.assign_attributes(record_params)
    return reject_managed_record if managed_record?(record)
    record.save!
    render json: serialize_record(record)
  end

  def destroy
    record = admin_records.find(params[:id])
    return head :forbidden unless record_mutation_allowed?(record)
    record.destroy!
    render json: { success: true }
  rescue ActiveRecord::RecordNotDestroyed => error
    render json: { errors: error.record.errors.full_messages.presence || ['Record could not be deleted'] }, status: :unprocessable_entity
  end

  def reset_user_password
    user = admin_user_scope.find(params[:id])
    return head :forbidden unless password_reset_allowed?(user)

    password_attributes = params.require(:password).permit(:password, :password_confirmation)

    if password_attributes[:password].blank? || password_attributes[:password_confirmation].blank?
      return render json: { errors: ["Password and confirmation are required"] }, status: :unprocessable_entity
    end

    if user.update(password_attributes)
      user.mobile_sessions.active.update_all(revoked_at: Time.current, updated_at: Time.current)
      AppEventLogger.info(
        :security_audit,
        source: "#{self.class.name}#reset_user_password",
        message: "Administrator reset a user password",
        payload: { administrator_id: current_user.id, target_user_id: user.id, workspace_id: user.workspace_id }
      )
      render json: { message: "Password updated successfully" }
    else
      render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def admin_records
    return admin_user_scope if @model == User
    records = @model.column_names.include?("workspace_id") ? @model.where(workspace_id: current_user.workspace_id) : @model.all
    return records.where(operation_source_type: nil) if @model == CalendarEvent
    return records.joins(:calendar_event).where(calendar_events: { operation_source_type: nil }) if @model == EventReminder

    records
  end

  def record_mutation_allowed?(record)
    # Role changes must use the dedicated owner-authorized user endpoints.
    return false if @model == Role
    return true unless record.is_a?(User)
    return true if current_user.site_admin?

    return current_user.owner? || current_user.admin? if record.new_record?

    current_user.owner? && !record.site_admin?
  end

  def managed_record?(record)
    (record.is_a?(CalendarEvent) && record.managed_operation?) ||
      (record.is_a?(EventReminder) && record.calendar_event&.managed_operation?)
  end

  def reject_managed_record
    render json: { error: 'Manage this record in Project Environments.' }, status: :unprocessable_entity
  end

  def admin_user_scope
    return User.all if current_user.site_admin?

    User.where(workspace_id: current_user.workspace_id)
  end

  def password_reset_allowed?(target_user)
    return true if current_user.site_admin?
    return false if target_user.site_admin? || target_user.owner?
    return true if current_user.owner?

    current_user.admin? && !target_user.admin?
  end

  def admin_model_names
    names = Rails.cache.fetch("api_admin_model_names_v5_security", expires_in: 12.hours) do
      Rails.application.eager_load!

      not_needed_tables = %w[
        ApplicationRecord
        UserRole
        WebSession
        MobileDevice
        MobileSession
        McpAccessToken
        ProjectEnvironment
        ProjectOperationItem
        ProjectOperationEntry
        ProjectOperationChange
        ProjectDeployment
        ProjectDeploymentSeries
        OperationReminderDelivery
        ActiveStorage::Blob
        ActiveStorage::Attachment
        ActiveStorage::VariantRecord
        ActionText::RichText
        ActionText::EncryptedRichText
        ActionMailbox::InboundEmail
        ActionMailbox::Record
        ActiveStorage::Record
        ActionText::Record
      ]

      ActiveRecord::Base.descendants.map(&:name).uniq - not_needed_tables
    end
    return names if current_user.site_admin?

    names.select { |name| name.in?(%w[User Role]) || name.constantize.column_names.include?("workspace_id") }
  end

  def serialize_record(record)
    data = record.serializable_hash(except: serialization_excludes_for(record))
  
    if record.respond_to?(:image) && record.image.attached?
      data[:image_url] = url_for(record.image)
    end
  
    data
  end

  def serialization_excludes_for(record)
    excludes = [:image]
    excludes += User::PUBLIC_JSON_EXCLUDED_ATTRIBUTES if record.is_a?(User)
    excludes
  end

  def set_model
    requested_name = params[:table].to_s.classify
    Rails.application.eager_load!
    @model = ActiveRecord::Base.descendants.find do |model|
      model.name == requested_name && admin_model_names.include?(model.name)
    end
    raise ActiveRecord::RecordNotFound unless @model
  rescue ActiveRecord::RecordNotFound
    render json: { error: "Invalid table name" }, status: :unprocessable_entity
  end

  def record_params
    scalar_columns = @model.columns.reject { |column| json_column?(column) }.map { |column| column.name.to_sym }
    scalar_columns -= protected_admin_columns + %i[id workspace_id created_at updated_at]
    json_columns = @model.columns.select { |column| json_column?(column) }.map { |column| { column.name.to_sym => {} } }

    params.require(:record).permit(*scalar_columns, *json_columns)
  end

  def protected_admin_columns
    return %i[operations_revision] if @model == Project
    return %i[operation_source_type operation_source_id] if @model == CalendarEvent
    return [] unless @model == User

    %i[
      workspace_id
      demo_account
      site_admin
      encrypted_password
      reset_password_token
      confirmation_token
      encrypted_keka_api_key
      encrypted_keka_api_key_iv
    ] + User::PUBLIC_JSON_EXCLUDED_ATTRIBUTES.map(&:to_sym)
  end

  def hidden_admin_column?(column)
    return false unless @model == User

    column.name.to_sym.in?((protected_admin_columns + User::PUBLIC_JSON_EXCLUDED_ATTRIBUTES).uniq)
  end

  def filter_params
    raw_filters = params[:filters]
    return unless raw_filters.is_a?(ActionController::Parameters)

    raw_filters.permit(@model.column_names.map(&:to_sym)).reject { |_, value| value == "" }
  end

  def json_column?(column)
    column.type.in?([:json, :jsonb])
  end

  def authorize_admin_access!
    return if current_user&.site_admin? || current_user&.roles&.any? { |role| role.name.in?(%w[owner admin]) }

    head :forbidden
  end
end
