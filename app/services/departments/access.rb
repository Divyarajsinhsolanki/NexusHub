module Departments
  class Access
    def self.admin?(user) = user&.workspace_access? && (user.owner? || user.admin?)
    def self.head?(department,user) = user&.workspace_access?(department.workspace) && (admin?(user) || department.manager_id == user.id)
    def self.member?(department,user) = user&.workspace_access?(department.workspace) && (head?(department,user) || user.department_id == department.id)
    def self.manage?(department,user) = user&.workspace_access?(department.workspace) && (head?(department,user) || (user.department_id == department.id && user.department_role == 'manager'))
  end
end
