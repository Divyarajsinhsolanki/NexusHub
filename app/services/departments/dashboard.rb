module Departments
  class Dashboard
    def self.call(department, viewer)
      # Department membership does not grant access to private projects/tasks.
      members = department.users.order(:first_name, :last_name).to_a
      ids = members.map(&:id)
      projects = Project.accessible_to(viewer)
      memberships = ProjectUser.where(user_id: ids, status: 'active', project_id: projects.current_running.select(:id))
      allocations = memberships.group(:user_id).sum(:allocation_percentage)
      project_counts = memberships.group(:user_id).distinct.count(:project_id)
      tasks = Task.visible_to(viewer).where('COALESCE(assigned_to_user, developer_id) IN (?)', ids)
        .where("LOWER(COALESCE(status, 'todo')) NOT IN (?)", %w[done completed closed cancelled canceled])
      group = "COALESCE(assigned_to_user, developer_id)"
      counts = tasks.group(group).count
      overdue = tasks.where('end_date < ?', Date.current).group(group).count
      hours = tasks.group(group).sum(:estimated_hours)
      deadlines = tasks.where(end_date: Date.current..7.days.from_now.to_date).count
      {
        members_count: members.size, active_projects: projects.where(id: memberships.select(:project_id)).current_running.count,
        open_tasks: counts.values.sum, overdue_tasks: overdue.values.sum, due_this_week: deadlines,
        scope: 'Only projects and tasks you can access are included. Allocation totals are declared project allocations, not tracked availability.',
        workload: members.map do |member|
          allocation = allocations.fetch(member.id, 0)
          { user_id: member.id, name: member.full_name, role: department.manager_id == member.id ? 'head' : member.department_role,
            open_tasks: counts.fetch(member.id, 0), overdue_tasks: overdue.fetch(member.id, 0), estimated_hours: hours.fetch(member.id, 0).to_f,
            projects_count: project_counts.fetch(member.id, 0), allocation_percentage: allocation,
            availability: allocation > 100 ? 'overallocated' : allocation == 100 ? 'fully allocated' : allocation.positive? ? 'partially allocated' : 'unallocated' }
        end
      }
    end
  end
end
