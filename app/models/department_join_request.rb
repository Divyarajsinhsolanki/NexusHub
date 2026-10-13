class DepartmentJoinRequest < ApplicationRecord
  include WorkspaceScoped
  belongs_to :department
  belongs_to :source_department, class_name:'Department', optional:true
  belongs_to :user
  belongs_to :source_approver, class_name:'User', optional:true
  belongs_to :target_approver, class_name:'User', optional:true
  validates :status, inclusion:{in:%w[pending approved rejected cancelled]}
  validates :reason, length:{maximum:2000}
end
