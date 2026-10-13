class DepartmentComment < ApplicationRecord
  include WorkspaceScoped
  belongs_to :department_entry
  belongs_to :author, class_name:'User', optional:true
  validates :body, presence:true, length:{maximum:5000}
end
