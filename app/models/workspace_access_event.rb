class WorkspaceAccessEvent < ApplicationRecord
  include WorkspaceScoped
  belongs_to :actor, class_name: "User", optional: true
  belongs_to :subject, class_name: "User", optional: true
  validates :action, presence: true
end
