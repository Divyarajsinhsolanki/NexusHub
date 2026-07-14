require 'digest'

class User < ApplicationRecord
  include UserStampable

  devise :database_authenticatable, :registerable,
         :recoverable, :rememberable, :validatable, :confirmable

  enum :status, { invited: "invited", active: "active", locked: "locked" }, default: "invited"

  LANDING_PAGES = %w[demo calendar posts profile vault knowledge worklog projects teams pdf users departments chat notifications].freeze
  AVAILABILITY_LABELS = {
    'available_now' => 'Available Now',
    'available_soon' => 'Available in 2 weeks',
    'fully_booked' => 'Fully Booked'
  }.freeze
  NOTIFICATION_PREFERENCES_DEFAULTS = {
    "commented" => true,
    "assigned" => true,
    "update" => true,
    "chat_message" => true,
    "chat_ping" => true,
    "reacted" => true,
    "missed_call" => true,
    "calendar_reminder" => true,
    "digest" => false
  }.freeze
  AVATAR_COLOR_FORMAT = /\A#[0-9a-f]{6}\z/i
  PUBLIC_JSON_EXCLUDED_ATTRIBUTES = %i[
    encrypted_password
    reset_password_token
    reset_password_sent_at
    remember_created_at
    confirmation_token
    confirmation_sent_at
    unconfirmed_email
    keka_base_url
    keka_api_key
    keka_employee_id
    keka_profile_data
    keka_last_synced_at
    encrypted_keka_api_key
    encrypted_keka_api_key_iv
  ].freeze

  has_one_attached :profile_picture
  has_one_attached :cover_photo
  belongs_to :workspace
  has_many :posts, dependent: :destroy, inverse_of: :user
  has_many :tasks, foreign_key: :assigned_to_user, inverse_of: :assigned_user
  has_many :developed_tasks, class_name: 'Task', foreign_key: :developer_id, inverse_of: :developer
  has_many :items, inverse_of: :user
  has_many :comments, dependent: :destroy, inverse_of: :user
  has_many :work_logs, dependent: :destroy, inverse_of: :user
  has_many :work_notes, dependent: :destroy, inverse_of: :user
  has_many :developed_task_logs, class_name: 'TaskLog', foreign_key: :developer_id, inverse_of: :developer
  has_many :post_likes, dependent: :destroy, inverse_of: :user
  has_many :liked_posts, through: :post_likes, source: :post
  has_many :team_users, dependent: :destroy, inverse_of: :user
  has_many :teams, through: :team_users
  has_many :owned_teams, class_name: 'Team', foreign_key: :owner_id, inverse_of: :owner, dependent: :nullify
  has_many :user_roles, dependent: :destroy, inverse_of: :user
  has_many :roles, through: :user_roles
  has_many :project_users, dependent: :destroy, inverse_of: :user
  has_many :projects, through: :project_users
  has_many :owned_projects, class_name: 'Project', foreign_key: :owner_id, inverse_of: :owner, dependent: :nullify
  has_many :user_skills, dependent: :destroy
  has_many :skills, through: :user_skills
  has_many :learning_goals, dependent: :destroy, inverse_of: :user
  has_many :knowledge_bookmarks, dependent: :destroy, inverse_of: :user
  has_many :knowledge_prompt_runs, dependent: :destroy, inverse_of: :user
  has_many :knowledge_items, dependent: :destroy, inverse_of: :user
  has_many :pdf_documents, dependent: :destroy, inverse_of: :user
  has_many :pdf_document_operations, dependent: :destroy, inverse_of: :user
  has_many :pdf_document_artifacts, dependent: :destroy, inverse_of: :user
  has_many :given_skill_endorsements, class_name: 'SkillEndorsement', foreign_key: :endorser_id, dependent: :destroy, inverse_of: :endorser
  has_many :received_skill_endorsements, through: :user_skills, source: :skill_endorsements
  has_many :notifications, foreign_key: :recipient_id, dependent: :destroy
  has_many :conversation_participants, dependent: :destroy
  has_many :conversations, through: :conversation_participants
  has_many :messages, dependent: :destroy
  has_many :message_reactions, dependent: :destroy
  has_many :initiated_call_sessions, class_name: "CallSession", foreign_key: :initiator_id, dependent: :destroy, inverse_of: :initiator
  has_many :call_participants, dependent: :destroy
  has_many :call_sessions, through: :call_participants
  has_many :calendar_events, dependent: :destroy
  belongs_to :department, optional: true

  attr_encrypted :keka_api_key,
                 key: Digest::SHA256.digest(
                   ENV["KEKA_API_KEY_ENCRYPTION_KEY"].presence ||
                   Rails.application.secret_key_base
                 ),
                 algorithm: "aes-256-gcm"

  enum :availability_status, {
    available_now: 'available_now',
    available_soon: 'available_soon',
    fully_booked: 'fully_booked'
  }, default: 'available_now'

  validates :first_name, presence: true
  validates :last_name, presence: true
  validates :landing_page, inclusion: { in: LANDING_PAGES }
  validates :job_title, presence: true
  validates :availability_status, inclusion: { in: availability_statuses.keys }
  validates :phone_number, length: { maximum: 30 }, allow_blank: true
  validates :avatar_color, format: { with: AVATAR_COLOR_FORMAT }
  validates :demo_account, uniqueness: { scope: :workspace_id }, if: :demo_account?
  validate :department_belongs_to_workspace

  before_validation :normalize_avatar_color
  before_validation :ensure_avatar_color
  before_validation :assign_site_admin_from_environment
  after_create :assign_default_role

  def self.generate_avatar_color(seed)
    digest = Digest::SHA256.hexdigest(seed.to_s)
    hue = (digest[0, 2].to_i(16) / 255.0) * 360.0
    saturation = 0.62 + ((digest[2, 2].to_i(16) % 14) / 100.0)
    lightness = 0.45 + ((digest[4, 2].to_i(16) % 10) / 100.0)

    hsl_to_hex(hue, saturation, lightness)
  end

  def role_names
    @role_names ||= if association(:roles).loaded?
      roles.map(&:name)
    else
      UserRole.in_workspace(workspace)
        .where(user_id: id)
        .joins(:role)
        .order("roles.name")
        .pluck("roles.name")
    end
  end

  def has_role?(name)
    role_names.include?(name.to_s)
  end

  def owner?
    has_role?(:owner)
  end

  def admin?
    has_role?(:admin)
  end

  def member?
    has_role?(:member)
  end

  def project_manager?
    has_role?(:project_manager)
  end

  def team_leader?
    has_role?(:team_leader)
  end

  def demo_account?
    demo_account
  end

  def site_admin?
    site_admin
  end

  def full_name
    [first_name, last_name].compact_blank.join(' ')
  end

  def name
    full_name.presence || email
  end

  def availability_label
    AVAILABILITY_LABELS[availability_status] || availability_status.to_s.humanize
  end

  def keka_connected?
    keka_base_url.present? && safe_keka_api_key.present? && keka_employee_id.present?
  end

  def keka_api_key_masked
    api_key = safe_keka_api_key
    return if api_key.blank?

    visible = api_key.to_s.last(4)
    masked_length = [api_key.to_s.length - 4, 0].max
    "#{'*' * masked_length}#{visible}"
  end

  def safe_keka_api_key
    keka_api_key
  rescue OpenSSL::Cipher::CipherError, ArgumentError => error
    unless @keka_decryption_warning_logged
      Rails.logger.warn(
        "Unable to decrypt Keka credentials for user_id=#{id}; credentials must be saved again (#{error.class})."
      )
      @keka_decryption_warning_logged = true
    end
    nil
  end

  def keka_payload
    {
      connected: keka_connected?,
      base_url: keka_base_url,
      employee_id: keka_employee_id,
      api_key_masked: keka_api_key_masked,
      last_synced_at: keka_last_synced_at,
      data: keka_profile_data || {}
    }
  end

  def public_json(include_roles: false)
    options = { except: PUBLIC_JSON_EXCLUDED_ATTRIBUTES }
    payload = as_json(options)

    if include_roles
      payload["roles"] = role_names.sort.map { |role_name| { "name" => role_name } }
    end

    payload
  end

  def notification_preferences_with_defaults
    NOTIFICATION_PREFERENCES_DEFAULTS.merge((notification_preferences || {}).stringify_keys)
  end

  def notification_preference_enabled?(action)
    notification_preferences_with_defaults.fetch(action.to_s, true)
  end

  private

  def self.hsl_to_hex(hue, saturation, lightness)
    red, green, blue = hsl_to_rgb(hue, saturation, lightness)
    format('#%02x%02x%02x', red, green, blue)
  end

  def self.hsl_to_rgb(hue, saturation, lightness)
    chroma = (1 - (2 * lightness - 1).abs) * saturation
    hue_segment = hue / 60.0
    second_component = chroma * (1 - ((hue_segment % 2) - 1).abs)

    red1, green1, blue1 =
      case hue_segment
      when 0...1 then [chroma, second_component, 0]
      when 1...2 then [second_component, chroma, 0]
      when 2...3 then [0, chroma, second_component]
      when 3...4 then [0, second_component, chroma]
      when 4...5 then [second_component, 0, chroma]
      else [chroma, 0, second_component]
      end

    match = lightness - chroma / 2.0

    [
      ((red1 + match) * 255).round,
      ((green1 + match) * 255).round,
      ((blue1 + match) * 255).round
    ]
  end

  def normalize_avatar_color
    self.avatar_color = avatar_color.to_s.strip.downcase.presence
  end

  def ensure_avatar_color
    return if avatar_color.present?

    seed = email.presence || [first_name, last_name].compact.join(' ')
    self.avatar_color = self.class.generate_avatar_color(seed)
  end

  def assign_site_admin_from_environment
    configured_email = ENV["PORTFOLIO_ADMIN_EMAIL"].to_s.strip.downcase
    self.site_admin = true if configured_email.present? && email.to_s.downcase == configured_email
  end

  def department_belongs_to_workspace
    return if department.blank? || department.workspace_id == workspace_id

    errors.add(:department, "must belong to the same workspace")
  end

  def after_confirmation
    update_column(:status, "active")
  end

  def assign_default_role
    return unless roles.empty?

    member_role = Role.find_by(name: 'member')
    if member_role.present?
      roles << member_role
    else
      Rails.logger.error("User##{id} default role assignment failed: role 'member' not found")
    end
  end
end
