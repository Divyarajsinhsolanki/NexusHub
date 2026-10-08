require "uri"

class ProjectOperationEntry < ApplicationRecord
  include WorkspaceScoped

  belongs_to :project
  belongs_to :project_operation_item, inverse_of: :entries
  belongs_to :project_environment
  belongs_to :updated_by, class_name: "User", optional: true
  belongs_to :verified_by, class_name: "User", optional: true

  attr_encrypted :value, key: ->(_record) { Operations::Encryption.key }, algorithm: "aes-256-gcm"
  self.filter_attributes += %i[value encrypted_value encrypted_value_iv]

  validates :project_environment_id, uniqueness: { scope: :project_operation_item_id }
  validates :expected_version, :observed_version, length: { maximum: 160 }, allow_nil: true
  validates :source, presence: true, length: { maximum: 80 }
  validates :required, inclusion: { in: [true, false] }
  validate :same_project
  validate :typed_details
  validate :observation_timestamp
  validate :verification_matches_observation

  def value_configured?
    encrypted_value.present?
  end

  def configured?
    case project_operation_item.kind
    when "configuration" then value_configured?
    when "software" then observed_version.present?
    when "service" then endpoints.any?
    else false
    end
  end

  def endpoints
    return details["endpoints"] if details["endpoints"].is_a?(Array)
    details["endpoint"].present? ? [{ "label" => "API", "url" => details["endpoint"] }] : []
  end

  def serializable_hash(options = nil)
    super((options || {}).merge(except: Array(options&.dig(:except)) + %w[value encrypted_value encrypted_value_iv]))
  end

  private

  def same_project
    if project_operation_item && project_operation_item.project_id != project_id
      errors.add(:project_operation_item, "must belong to this project")
    end
    if project_environment && project_environment.project_id != project_id
      errors.add(:project_environment, "must belong to this project")
    end
    errors.add(:project_operation_item, "licenses do not have configuration entries") if project_operation_item&.kind == "license"
  end

  def typed_details
    unless details.is_a?(Hash)
      errors.add(:details, "must be an object")
      return
    end
    allowed = project_operation_item&.kind == "service" ? %w[endpoint endpoints credential_item_ids] : []
    errors.add(:details, "contains unsupported fields") if (details.keys - allowed).any?
    errors.add(:details, "is too large") if details.to_json.bytesize > 16_384
    return unless project_operation_item&.kind == "service"

    if details.key?("endpoints")
      unless details["endpoints"].is_a?(Array) && details["endpoints"].length <= 20
        errors.add(:details, "endpoints must be a list of at most 20 labelled URLs")
        return
      end
      labels = []
      details["endpoints"].each do |endpoint|
        unless endpoint.is_a?(Hash) && (endpoint.keys - %w[label url]).empty? && endpoint["label"].is_a?(String) && endpoint["label"].strip.present? && endpoint["label"].length <= 80 && endpoint["url"].is_a?(String) && endpoint["url"].present?
          errors.add(:details, "each endpoint needs a label and URL")
          next
        end
        labels << endpoint["label"].strip.downcase
        validate_endpoint(endpoint["url"])
      end
      errors.add(:details, "endpoint labels must be unique") if labels.uniq.length != labels.length
    end
    validate_endpoint(details["endpoint"]) if details["endpoint"].present?
    ids = details.fetch("credential_item_ids", [])
    valid_ids = ids.is_a?(Array) && ids.all? { |id| id.to_s.match?(/\A[1-9]\d*\z/) }
    found = valid_ids && ProjectOperationItem.where(project_id: project_id, kind: "configuration", secret: true, id: ids).count == ids.map(&:to_i).uniq.length
    errors.add(:details, "credential references must be secret configuration items in this project") unless found
  end

  def validate_endpoint(endpoint)
    unless endpoint.is_a?(String) && endpoint.length <= 2_048
      errors.add(:details, "endpoint must be a URL of at most 2048 characters")
      return
    end
      begin
        uri = URI.parse(endpoint.to_s)
        unless uri.scheme.in?(%w[http https]) && uri.host.present? && uri.userinfo.blank? && uri.query.blank? && uri.fragment.blank?
          errors.add(:details, "endpoint must be an HTTP(S) URL without embedded credentials, query parameters or fragments")
        end
      rescue URI::InvalidURIError
        errors.add(:details, "endpoint must be a valid HTTP(S) URL")
      end
  end

  def observation_timestamp
    return if observed_at.blank?
    errors.add(:observed_at, "requires an observed version") if observed_version.blank?
    errors.add(:observed_at, "cannot be in the future") if observed_at > 1.minute.from_now
  end

  def verification_matches_observation
    return unless verified_at
    errors.add(:verified_at, "requires matching expected and observed versions") unless project_operation_item&.kind == "software" && expected_version.present? && observed_version == expected_version && observed_at.present?
  end
end
