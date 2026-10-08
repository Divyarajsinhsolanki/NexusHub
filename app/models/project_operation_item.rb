class ProjectOperationItem < ApplicationRecord
  include WorkspaceScoped

  KINDS = %w[configuration software service license].freeze
  COMPARISONS = %w[environment_specific must_match].freeze
  DETAIL_KEYS = {
    "configuration" => %w[scope documentation_url],
    "software" => %w[ecosystem purpose documentation_url service_id],
    "service" => %w[purpose owner_id documentation_url],
    "license" => %w[owner_id environment_ids service_ids expiry_date time_zone recipient_ids reminder_days vendor license_type reference renewal_url notes]
  }.freeze

  belongs_to :project
  has_many :entries, class_name: "ProjectOperationEntry", dependent: :destroy, inverse_of: :project_operation_item
  has_many :operation_reminder_deliveries, as: :source, dependent: :destroy
  has_one :operation_calendar_event, as: :operation_source, class_name: "CalendarEvent", dependent: :destroy

  attr_encrypted :license_key, key: ->(_record) { Operations::Encryption.key }, algorithm: "aes-256-gcm"
  self.filter_attributes += %i[license_key encrypted_license_key encrypted_license_key_iv]

  before_validation :normalize_fields
  validates :kind, inclusion: { in: KINDS }
  validates :name, presence: true, length: { maximum: 160 }, uniqueness: { scope: [:project_id, :kind] }
  validates :description, length: { maximum: 4_000 }
  validates :category, length: { maximum: 80 }
  validates :comparison, inclusion: { in: COMPARISONS }
  validates :secret, inclusion: { in: [true, false] }
  validate :configuration_key_format
  validate :secret_cannot_become_public
  validate :typed_details

  def license_key_configured?
    encrypted_license_key.present?
  end

  def serializable_hash(options = nil)
    super((options || {}).merge(except: Array(options&.dig(:except)) + %w[license_key encrypted_license_key encrypted_license_key_iv]))
  end

  private

  def normalize_fields
    self.name = name.to_s.strip
    self.description = description.to_s.strip.presence
    self.category = category.to_s.strip.presence
    self.details = details.deep_stringify_keys if details.is_a?(Hash)
    self.secret = false if kind.in?(%w[software service])
    self.secret = true if kind == "license"
  end

  def configuration_key_format
    return unless kind == "configuration"
    errors.add(:name, "must start with a letter or underscore and contain only letters, numbers, underscores, dots or hyphens") unless name.to_s.match?(/\A[A-Za-z_][A-Za-z0-9_.-]*\z/)
  end

  def secret_cannot_become_public
    if persisted? && secret_in_database && !secret && kind == "configuration"
      errors.add(:secret, "cannot be made public after it has been saved")
    end
    errors.add(:kind, "cannot be changed after creation") if persisted? && will_save_change_to_kind?
  end

  def typed_details
    unless details.is_a?(Hash)
      errors.add(:details, "must be an object")
      return
    end
    errors.add(:details, "contains unsupported fields") if (details.keys - DETAIL_KEYS.fetch(kind, [])).any?
    errors.add(:details, "is too large") if details.to_json.bytesize > 16_384
    text_fields = DETAIL_KEYS.fetch(kind, []) - %w[owner_id environment_ids service_ids service_id recipient_ids reminder_days]
    text_fields.each do |field|
      errors.add(:details, "#{field} must be text") if details.key?(field) && !details[field].nil? && !details[field].is_a?(String)
    end
    validate_member_id(details["owner_id"], "owner") if details["owner_id"].present?
    if kind == "software" && details["service_id"].present?
      id = details["service_id"]
      valid = id.to_s.match?(/\A[1-9]\d*\z/) && self.class.where(project_id: project_id, kind: "service", id: id).exists?
      errors.add(:details, "service must belong to this project") unless valid
    end
    return unless kind == "license"

    errors.add(:details, "must include an active project owner for this license") if details["owner_id"].blank?
    validate_ids("environment_ids", ProjectEnvironment.where(project_id: project_id))
    validate_ids("service_ids", self.class.where(project_id: project_id, kind: "service"))
    recipient_ids = details.fetch("recipient_ids", [])
    if recipient_ids.is_a?(Array)
      recipient_ids.each { |id| validate_member_id(id, "recipient") }
    else
      errors.add(:details, "recipient_ids must be a list")
    end
    if details["expiry_date"].present?
      begin
        date = Date.iso8601(details["expiry_date"].to_s)
        errors.add(:details, "expiry_date must use YYYY-MM-DD") unless date.iso8601 == details["expiry_date"]
      rescue ArgumentError
        errors.add(:details, "expiry_date must use YYYY-MM-DD")
      end
    end
    zone = details["time_zone"]
    begin
      TZInfo::Timezone.get(zone.to_s)
    rescue TZInfo::InvalidTimezoneIdentifier
      errors.add(:details, "time_zone must be a valid IANA time zone")
    end
    days = details.fetch("reminder_days", [30, 7, 1])
    errors.add(:details, "reminder_days must contain between zero and six non-negative day offsets") unless days.is_a?(Array) && days.length <= 6 && days.all? { |day| day.is_a?(Integer) && day.between?(0, 365) }
  end

  def validate_member_id(id, label)
    valid_id = id.to_s.match?(/\A[1-9]\d*\z/)
    valid = valid_id && ProjectUser.where(project_id: project_id, user_id: id, status: "active").exists?
    errors.add(:details, "#{label} must be an active project member") unless valid
  end

  def validate_ids(key, scope)
    ids = details.fetch(key, [])
    unless ids.is_a?(Array) && ids.all? { |id| id.to_s.match?(/\A[1-9]\d*\z/) }
      errors.add(:details, "#{key} must contain valid IDs")
      return
    end
    errors.add(:details, "#{key} must belong to this project") unless scope.where(id: ids).count == ids.map(&:to_i).uniq.length
  end
end
