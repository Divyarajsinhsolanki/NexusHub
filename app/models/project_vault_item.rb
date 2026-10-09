class ProjectVaultItem < ApplicationRecord
  include WorkspaceScoped
  encrypts :content, key_provider: VaultKeyProvider.new, support_unencrypted_data: true

  belongs_to :project, inverse_of: :project_vault_items
  belongs_to :project_environment, optional: true

  validates :title, presence: true
  validates :content, presence: true

  CATEGORIES = %w[Credential Command Note Token Server Database Update Info Media].freeze

  validates :category, inclusion: { in: CATEGORIES }, allow_blank: true
end
