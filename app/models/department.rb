class Department < ApplicationRecord
  include WorkspaceScoped

  belongs_to :manager, class_name: "User", optional: true
  has_many :users, dependent: :nullify
  has_many :department_entries, dependent: :destroy
  has_many :department_join_requests, dependent: :destroy
  has_many :outgoing_department_requests, class_name:'DepartmentJoinRequest', foreign_key: :source_department_id, dependent: :destroy

  before_destroy -> { users.update_all(department_role: 'member') }, prepend: true

  validates :name, presence: true, uniqueness: { scope: :workspace_id }
end
