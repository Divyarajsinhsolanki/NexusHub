require 'test_helper'

class DepartmentDashboardTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name:'Departments',slug:'department-dashboard-test',kind:'private')
    @head = create_test_user(workspace:@workspace,email:'head@department.test')
    @member = create_test_user(workspace:@workspace,email:'member@department.test')
    Current.set(workspace:@workspace,user:@head) do
      @department = Department.create!(name:'Engineering',manager:@head)
      @head.update!(department_id:@department.id)
      @member.update!(department_id:@department.id)
    end
    session, = MobileSession.issue_for!(user:@head)
    @headers = {'Authorization'=>"Bearer #{MobileAccessToken.issue(session)[:token]}"}
  end

  test 'head assigns managers without granting global roles and ordinary members cannot' do
    patch "/api/v1/departments/#{@department.id}/update_role",params:{user_id:@member.id,role:'manager'},headers:@headers
    assert_response :success
    assert_equal 'manager',@member.reload.department_role
    refute @member.admin?
    patch "/api/v1/departments/#{@department.id}/update_role",params:{user_id:@member.id,role:'owner'},headers:@headers
    assert_response :unprocessable_entity
    session, = MobileSession.issue_for!(user:@member)
    patch "/api/v1/departments/#{@department.id}/update_role",params:{user_id:@head.id,role:'member'},headers:{'Authorization'=>"Bearer #{MobileAccessToken.issue(session)[:token]}"}
    assert_response :forbidden
  end

  test 'foreign workspace membership is rejected without removing current members' do
    other = Workspace.create!(name:'Other',slug:'department-other',kind:'private')
    outsider = create_test_user(workspace:other,email:'outsider@department.test')
    patch "/api/v1/departments/#{@department.id}/update_members",params:{user_ids:[outsider.id]},headers:@headers
    assert_response :unprocessable_entity
    assert_equal @department.id,@member.reload.department_id
    patch "/api/v1/departments/#{@department.id}/update_role",params:{user_id:outsider.id,role:'manager'},headers:@headers
    assert_response :not_found
  end

  test 'manager membership updates preserve roles and removing a member clears role' do
    @member.update!(department_role:'manager')
    patch "/api/v1/departments/#{@department.id}/update_members",params:{user_ids:[@head.id,@member.id]},headers:@headers
    assert_response :success
    assert_equal 'manager',@member.reload.department_role
    patch "/api/v1/departments/#{@department.id}/update_members",params:{user_ids:[@head.id]},headers:@headers
    assert_response :success
    assert_nil @member.reload.department_id
    assert_equal 'member',@member.department_role
  end

  test 'dashboard honors project visibility and counts assigned overdue work and allocations' do
    Current.set(workspace:@workspace,user:@head) do
      visible = Project.create!(name:'Visible',owner:@head)
      hidden = Project.create!(name:'Hidden',owner:@member)
      ProjectUser.create!(project:visible,user:@member,allocation_percentage:70)
      ProjectUser.create!(project:hidden,user:@member,allocation_percentage:100)
      Task.create!(project:visible,developer:@member,task_id:'DEPT-1',type:'Code',status:'todo',end_date:Date.yesterday,estimated_hours:3)
      Task.create!(project:hidden,developer:@member,task_id:'DEPT-2',type:'Code',status:'todo',end_date:Date.yesterday,estimated_hours:8)
    end
    get "/api/v1/departments/#{@department.id}",headers:@headers
    assert_response :success
    payload=response.parsed_body
    payload=payload['data'] if payload['data']
    row=payload.fetch('dashboard').fetch('workload').find{|entry|entry['user_id']==@member.id}
    assert_equal 1,row['open_tasks']
    assert_equal 1,row['overdue_tasks']
    assert_equal 3.0,row['estimated_hours']
    assert_equal 70,row['allocation_percentage']
  end

  test 'moving departments through user updates resets the old manager designation' do
    @member.update!(department_role:'manager')
    other_department = nil
    Current.set(workspace:@workspace) { other_department = Department.create!(name:'Design') }
    @member.update!(department_id:other_department.id)
    assert_equal 'member',@member.reload.department_role
  end

  test 'department managers can add unassigned members but cannot transfer another department members' do
    @member.update!(department_role:'manager')
    candidate = create_test_user(workspace:@workspace,email:'candidate@department.test')
    session, = MobileSession.issue_for!(user:@member)
    headers = {'Authorization'=>"Bearer #{MobileAccessToken.issue(session)[:token]}"}
    patch "/api/v1/departments/#{@department.id}/update_members",params:{user_ids:[@head.id,@member.id,candidate.id]},headers:headers
    assert_response :success
    assert_equal @department.id,candidate.reload.department_id
    Current.set(workspace:@workspace) { candidate.update!(department_id:Department.create!(name:'Other department').id) }
    patch "/api/v1/departments/#{@department.id}/update_members",params:{user_ids:[@head.id,@member.id,candidate.id]},headers:headers
    assert_response :forbidden
    refute_equal @department.id,candidate.reload.department_id
  end

  test 'demo account cannot assign department roles' do
    @head.update!(demo_account:true)
    patch "/api/v1/departments/#{@department.id}/update_role",params:{user_id:@member.id,role:'manager'},headers:@headers
    assert_response :forbidden
    assert_equal 'member',@member.reload.department_role
  end
end
