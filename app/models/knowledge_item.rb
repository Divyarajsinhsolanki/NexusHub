require "securerandom"

class KnowledgeItem < ApplicationRecord
  include WorkspaceScoped

  CATEGORIES = %w[news learning stocks tech facts research custom].freeze
  ITEM_TYPES = %w[fact news article note idea question answer summary resource].freeze

  belongs_to :user, inverse_of: :knowledge_items
  belongs_to :knowledge_prompt_run, inverse_of: :knowledge_items
  belongs_to :replaced_by, class_name: "KnowledgeItem", optional: true
  has_many :replacements, class_name: "KnowledgeItem", foreign_key: :replaced_by_id, dependent: :nullify, inverse_of: :replaced_by

  validates :title, :category, :item_type, :source_key, presence: true

  before_validation :assign_defaults

  scope :active, -> { where(active: true) }
  scope :archived, -> { where(active: false) }
  scope :latest_first, -> { order(created_at: :desc, id: :desc) }

  def self.source_key_for(category:, title:, source_url: nil)
    [category, title, source_url].map { |part| part.to_s.strip.downcase.parameterize }.reject(&:blank?).join(":").presence || SecureRandom.hex(8)
  end

  scope :visible_to, ->(user) {
    joins(:knowledge_prompt_run).where(
      "knowledge_items.user_id = :user_id OR (knowledge_prompt_runs.source = :source AND knowledge_items.payload ->> 'workspace_shared' = 'true')",
      user_id: user.id, source: "bedrock_daily"
    )
  }

  def archive!(replacement: nil)
    update!(active: false, archived_at: Time.current, replaced_by: replacement)
  end

  private

  def assign_defaults
    self.user ||= knowledge_prompt_run&.user
    self.category = category.to_s.presence || "learning"
    self.item_type = item_type.to_s.presence || "fact"
    self.tags = Array(tags).map(&:to_s).reject(&:blank?)
    self.payload ||= {}
    self.source_key = source_key.presence || self.class.source_key_for(category: category, title: title, source_url: source_url)
  end
end
