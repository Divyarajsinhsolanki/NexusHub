require 'test_helper'

class ProjectDateStatusTest < ActiveSupport::TestCase
  setup do
    @workspace = Workspace.create!(name: 'Date status', slug: 'date-status', kind: 'private')
    Current.workspace = @workspace
  end

  test 'serialized status and predicates follow dates without a save' do
    travel_to Time.zone.local(2026, 10, 1, 12) do
      project = Project.create!(name: 'Scheduled', start_date: Date.new(2026, 10, 2), end_date: Date.new(2026, 10, 3))
      assert project.upcoming?
      travel_to Time.zone.local(2026, 10, 2, 12)
      assert project.running?
      assert_equal 'running', project.as_json['status']
      assert Project.current_running.exists?(project.id)
      travel_to Time.zone.local(2026, 10, 4, 12)
      assert project.completed?
      assert_equal 'completed', project.as_json['status']
      assert_not Project.current_running.exists?(project.id)
      ProjectStatusRefreshJob.perform_now
      assert_equal 'completed', Project.unscoped.where(id: project.id).pick(:status)
    end
  end
end
