class PrivacyRequestEvent < ApplicationRecord
  belongs_to :privacy_request
  belongs_to :actor, class_name: 'User', optional: true
end
