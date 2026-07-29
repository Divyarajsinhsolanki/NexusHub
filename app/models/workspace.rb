class Workspace < ApplicationRecord
  REGULAR_SLUG = "private-workspace".freeze
  KINDS = %w[private demo].freeze
  BILLING_STATUSES = %w[trialing active past_due canceled].freeze

  has_many :users, dependent: :destroy
  has_many :projects, dependent: :destroy
  has_many :teams, dependent: :destroy
  has_many :knowledge_prompt_runs, dependent: :destroy
  has_many :knowledge_items, dependent: :destroy
  has_many :pdf_documents, dependent: :destroy
  has_many :pdf_document_versions, dependent: :destroy
  has_many :pdf_document_operations, dependent: :destroy
  has_many :pdf_document_artifacts, dependent: :destroy

  validates :name, :slug, :kind, presence: true
  validates :plan_key, :billing_status, presence: true
  validates :slug, uniqueness: true
  validates :kind, inclusion: { in: KINDS }
  validates :billing_status, inclusion: { in: BILLING_STATUSES }
  validates :seat_limit_override, numericality: { only_integer: true, greater_than: 0 }, allow_nil: true
  validate :plan_key_exists

  before_validation :assign_saas_defaults
  before_validation :normalize_slug

  def self.regular!
    find_or_create_by!(slug: REGULAR_SLUG) do |workspace|
      workspace.name = "Nexus Hub Workspace"
      workspace.kind = "private"
      workspace.plan_key = "enterprise"
      workspace.billing_status = "active"
    end
  end

  def demo?
    kind == "demo"
  end

  def saas_plan
    Saas::PlanCatalog.snapshot(self)
  end

  def module_enabled?(key)
    Saas::PlanCatalog.module_enabled?(self, key)
  end

  private

  def assign_saas_defaults
    if demo?
      self.plan_key = "enterprise" if plan_key.blank? || plan_key == "starter"
      self.billing_status = "active" if billing_status.blank? || billing_status == "trialing"
    else
      self.plan_key = "starter" if plan_key.blank?
      self.billing_status = "trialing" if billing_status.blank?
    end
    self.trial_ends_at ||= 14.days.from_now if billing_status == "trialing"
  end

  def normalize_slug
    self.slug = name.to_s.parameterize if slug.blank?
  end

  def plan_key_exists
    return if plan_key.blank? || Saas::PlanCatalog.keys.include?(plan_key)

    errors.add(:plan_key, "is not a supported SaaS plan")
  end
end
