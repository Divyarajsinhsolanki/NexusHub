class Item < ApplicationRecord
  include WorkspaceScoped
  encrypts :content, key_provider: VaultKeyProvider.new, support_unencrypted_data: false

  belongs_to :user, inverse_of: :items

  validates :title, presence: true
  validates :content, presence: true
end
