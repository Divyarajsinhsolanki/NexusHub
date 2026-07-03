class Api::AdminController < Api::BaseController
  before_action :authorize_admin_access!
  before_action :set_model, except: [:tables]
  
  def tables
    render json: admin_model_names
  end

  def meta
    columns = @model.columns.map do |c|
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

    records = @model.order(id: :desc)

    filters = filter_params
    records = records.where(filters) if filters.present?

    total_count = records.count
    records = records.offset((page - 1) * per_page).limit(per_page)

    json_records = records.map do |record|
      data = record.serializable_hash(except: serialization_excludes_for(record))

      if record.respond_to?(:image) && record.image.attached?
        data[:image_url] = url_for(record.image)
      end

      data
    end

    render json: {
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
    record = @model.new(record_params)
    record.save!
    render json: serialize_record(record)
  end
  
  def update
    record = @model.find(params[:id])
    record.update!(record_params)
    render json: serialize_record(record)
  end

  def destroy
    record = @model.find(params[:id])
    record.destroy!
    render json: { success: true }
  end

  private

  def admin_model_names
    Rails.cache.fetch("api_admin_model_names", expires_in: 12.hours) do
      Rails.application.eager_load!

      not_needed_tables = %w[
        ApplicationRecord
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
    scalar_columns -= protected_admin_columns
    json_columns = @model.columns.select { |column| json_column?(column) }.map { |column| { column.name.to_sym => {} } }

    params.require(:record).permit(*scalar_columns, *json_columns)
  end

  def protected_admin_columns
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
    ]
  end

  def filter_params
    raw_filters = params[:filters]
    return unless raw_filters.is_a?(ActionController::Parameters)

    raw_filters.permit(@model.column_names.map(&:to_sym))
  end

  def json_column?(column)
    column.type.in?([:json, :jsonb])
  end

  def authorize_admin_access!
    return if current_user&.site_admin? || current_user&.roles&.any? { |role| role.name.in?(%w[owner admin]) }

    head :forbidden
  end
end
