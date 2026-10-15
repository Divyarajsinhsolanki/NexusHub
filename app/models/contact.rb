class Contact < ApplicationRecord
  validates :name, :email, :message, presence: true
  validates :name, length: { maximum: 120 }
  validates :email, length: { maximum: 254 }
  validates :message, length: { maximum: 10_000 }
end
