require 'test_helper'

class TaskUpdaterTest < ActiveSupport::TestCase
  setup do
    @workspace = Workspace.create!(name: 'Updater groups', slug: 'updater-groups', kind: 'private')
    @user = create_test_user(workspace: @workspace, email: 'updater@example.test')
    Current.workspace = @workspace
    Current.user = @user
    @project = Project.create!(name: 'Ordering', owner: @user)
    @sprint = @project.sprints.create!(name: 'Current', start_date: Date.current, end_date: Date.current + 7)
  end

  test 'QA reordering is scoped to the QA assignee' do
    first = qa_task('First', 'Anita', 1)
    second = qa_task('Second', 'Anita', 2)
    other = qa_task('Other', 'Sam', 1)
    assert Tasks::Updater.call(second, order: 1)
    assert_equal [2, 1, 1], [first.reload.order, second.reload.order, other.reload.order]
  end

  test 'moving between assignment groups appends and closes the old gap' do
    first = qa_task('First', 'Anita', 1)
    second = qa_task('Second', 'Anita', 2)
    destination = qa_task('Destination', 'Sam', 1)
    assert Tasks::Updater.call(first, qa_assigned: 'Sam')
    assert_equal [2, 1, 1], [first.reload.order, second.reload.order, destination.reload.order]
  end

  test 'validation failures leave the ordering unchanged' do
    first = qa_task('First', 'Anita', 1)
    second = qa_task('Second', 'Anita', 2)
    assert_not Tasks::Updater.call(second, title: nil, order: 1)
    assert_equal [1, 2], [first.reload.order, second.reload.order]
  end

  private

  def qa_task(title, assignee, order)
    @project.tasks.create!(title: title, type: 'qa', sprint: @sprint, qa_assigned: assignee, order: order)
  end
end
