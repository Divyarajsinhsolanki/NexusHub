require 'test_helper'
class DepartmentWorkflowsTest < ActionDispatch::IntegrationTest
  setup do
    @workspace=Workspace.create!(name:'Workflow',slug:'workflow-test',kind:'private')
    @head=create_test_user(workspace:@workspace,email:'head@workflow.test')
    @other_head=create_test_user(workspace:@workspace,email:'other-head@workflow.test')
    @member=create_test_user(workspace:@workspace,email:'member@workflow.test')
    @outsider=create_test_user(workspace:@workspace,email:'outsider@workflow.test')
    Current.set(workspace:@workspace) do
      @source=Department.create!(name:'Engineering',manager:@head)
      @target=Department.create!(name:'Design',manager:@other_head)
      @member.update!(department_id:@source.id)
      @entry=DepartmentEntry.create!(department:@source,author:@head,kind:'announcement',title:'Welcome',body:'Team news',pinned:true)
    end
    @headers=headers_for(@head)
  end
  def headers_for(user)
    session,=MobileSession.issue_for!(user:user)
    {'Authorization'=>"Bearer #{MobileAccessToken.issue(session)[:token]}"}
  end
  def root(dept=@source) = "/api/v1/departments/#{dept.id}"
  def data
    payload=response.parsed_body
    payload['data']||payload
  end
  test 'heads manage validated goals and stale edits conflict' do
    post "#{root}/entries",params:{entry:{kind:'goal',title:'Ship release',progress:25,due_date:Date.current.iso8601}},headers:@headers
    assert_response :created
    entry=data
    patch "#{root}/entries/#{entry['id']}",params:{entry:{progress:65,lock_version:entry['lock_version']}},headers:@headers
    assert_response :success
    patch "#{root}/entries/#{entry['id']}",params:{entry:{progress:80,lock_version:entry['lock_version']}},headers:@headers
    assert_response :conflict
    post "#{root}/entries",params:{entry:{kind:'goal',title:'Bad',progress:101}},headers:@headers
    assert_response :unprocessable_entity
  end
  test 'members read and comment but cannot author goals or delete another comment' do
    headers=headers_for(@member)
    get "#{root}/entries",params:{kind:'announcement'},headers:headers
    assert_response :success
    assert_equal 'Welcome',data.first['title']
    post "#{root}/entries",params:{entry:{kind:'goal',title:'Unauthorized'}},headers:headers
    assert_response :forbidden
    post "#{root}/entries/#{@entry.id}/comments",params:{body:'Thanks'},headers:headers
    assert_response :created
    comment_id=data['id']
    @outsider.update!(department_id:@source.id)
    delete "#{root}/entries/#{@entry.id}/comments/#{comment_id}",headers:headers_for(@outsider)
    assert_response :forbidden
    delete "#{root}/entries/#{@entry.id}/comments/#{comment_id}",headers:headers
    assert_response :success
  end
  test 'nonmembers and other workspaces cannot read content or reports' do
    get "#{root}/entries",headers:headers_for(@outsider)
    assert_response :forbidden
    other=Workspace.create!(name:'Other',slug:'workflow-other',kind:'private')
    user=create_test_user(workspace:other,email:'cross@workflow.test')
    get "#{root}/entries",headers:headers_for(user)
    assert_response :not_found
    get "#{root}/report",headers:headers_for(@outsider)
    assert_response :forbidden
  end
  test 'resources reject unsafe links' do
    ['javascript:alert(1)','http://example.com','https://user:password@example.com'].each do |url|
      post "#{root}/entries",params:{entry:{kind:'resource',title:'Unsafe',url:url}},headers:@headers
      assert_response :unprocessable_entity
    end
    post "#{root}/entries",params:{entry:{kind:'resource',title:'Onboarding',body:'Guide',url:'https://example.com/guide'}},headers:@headers
    assert_response :created
  end
  test 'transfer requires both heads and resets departmental role' do
    @member.update!(department_role:'manager')
    post "#{root(@target)}/requests",params:{reason:'New work'},headers:headers_for(@member)
    assert_response :created
    request_id=data['id']
    patch "#{root(@target)}/requests/#{request_id}",params:{decision:'approve'},headers:headers_for(@other_head)
    assert_response :success
    assert_equal 'pending',data['status']
    assert_equal @source.id,@member.reload.department_id
    patch "#{root}/requests/#{request_id}",params:{decision:'approve'},headers:@headers
    assert_response :success
    assert_equal 'approved',data['status']
    assert_equal @target.id,@member.reload.department_id
    assert_equal 'member',@member.department_role
    patch "#{root}/requests/#{request_id}",params:{decision:'approve'},headers:@headers
    assert_response :conflict
  end
  test 'pending joins are unique, private, and cancellable by requester' do
    headers=headers_for(@outsider)
    post "#{root}/requests",params:{reason:'Join'},headers:headers
    assert_response :created
    request_id=data['id']
    post "#{root(@target)}/requests",headers:headers
    assert_response :conflict
    get "#{root}/requests",headers:headers_for(@member)
    assert_response :success
    assert_empty data
    patch "#{root}/requests/#{request_id}",params:{decision:'approve'},headers:headers_for(@member)
    assert_response :forbidden
    patch "#{root}/requests/#{request_id}",params:{decision:'cancel'},headers:headers
    assert_response :success
    assert_equal 'cancelled',data['status']
  end
  test 'membership changes invalidate pending transfer rather than overwrite current membership' do
    post "#{root(@target)}/requests",headers:headers_for(@member)
    request_id=data['id']
    @member.update!(department_id:nil)
    patch "#{root(@target)}/requests/#{request_id}",params:{decision:'approve'},headers:headers_for(@other_head)
    assert_response :success
    patch "#{root}/requests/#{request_id}",params:{decision:'approve'},headers:@headers
    assert_response :conflict
    assert_nil @member.reload.department_id
  end
  test 'reports preserve private work logs and validate date ranges' do
    Current.set(workspace:@workspace) do
      WorkLog.create!(user:@member,title:'Private',log_date:Date.current,start_time:'09:00',end_time:'10:00',actual_minutes:60)
    end
    get "#{root}/report",headers:@headers
    assert_response :success
    assert_equal 0.0,data['your_logged_hours']
    get "#{root}/report",params:{from:'bad',to:Date.current.iso8601},headers:@headers
    assert_response :unprocessable_entity
  end
  test 'workspace administrator can resolve both transfer approvals' do
    post "#{root(@target)}/requests",headers:headers_for(@member)
    request_id=data['id']
    Current.set(workspace:@workspace,user:@head) { @head.roles=[Role.find_by!(name:'owner')] }
    patch "#{root(@target)}/requests/#{request_id}",params:{decision:'approve'},headers:@headers
    assert_response :success
    assert_equal 'approved',data['status']
    assert_equal @target.id,@member.reload.department_id
  end
  test 'exports include personal comments and requests and deletion anonymizes shared content' do
    request_id=comment_id=entry_id=nil
    Current.set(workspace:@workspace,user:@member) do
      own_entry=DepartmentEntry.create!(department:@source,author:@member,kind:'resource',title:'Shared guide')
      entry_id=own_entry.id
      comment_id=DepartmentComment.create!(department_entry:@entry,author:@member,body:'Personal comment').id
      request_id=DepartmentJoinRequest.create!(department:@target,source_department:@source,user:@member,reason:'Personal request').id
      payload=Accounts::Export.call(@member)
      assert_equal [comment_id],payload[:department_comments].map{|row|row['id']}
      assert_equal [request_id],payload[:department_requests].map{|row|row['id']}
      AccountDeletionRequest.create!(user:@member,status:'scheduled',delete_after:1.day.ago,receipt_id:SecureRandom.uuid)
    end
    Accounts::Lifecycle.new(@member).finalize!
    assert @member.reload.deleted_at?
    assert_nil DepartmentEntry.unscoped.find(entry_id).author_id
    refute DepartmentComment.unscoped.exists?(comment_id)
    refute DepartmentJoinRequest.unscoped.exists?(request_id)
  end
  test 'department content is paginated and deleting an announcement removes its comments' do
    Current.set(workspace:@workspace) do
      26.times{|index|DepartmentEntry.create!(department:@source,kind:'goal',title:"Goal #{index}")}
      DepartmentComment.create!(department_entry:@entry,author:@member,body:'Comment')
    end
    get "#{root}/entries",params:{kind:'goal'},headers:@headers
    assert_response :success
    assert_equal 25,data.size
    assert_equal 2,response.parsed_body.dig('meta','next_page')
    delete "#{root}/entries/#{@entry.id}",headers:@headers
    assert_response :success
    refute DepartmentComment.unscoped.where(department_entry_id:@entry.id).exists?
  end

  test 'administrative user removal cleans up new foreign keys' do
    entry=request=nil
    Current.set(workspace:@workspace) do
      entry=DepartmentEntry.create!(department:@source,author:@member,kind:'resource',title:'Shared guide')
      DepartmentComment.create!(department_entry:@entry,author:@member,body:'Personal comment')
      request=DepartmentJoinRequest.create!(department:@target,user:@outsider,source_department:@source,source_approver:@member,source_approved:true)
      @member.destroy!
    end
    assert_nil entry.reload.author_id
    assert_nil request.reload.source_approver_id
    refute DepartmentComment.unscoped.where(author_id:@member.id).exists?
  end

  test 'demo mutations stay forbidden'   do
    @head.update!(demo_account:true)
    post "#{root}/entries",params:{entry:{kind:'announcement',title:'No'}},headers:@headers
    assert_response :forbidden
  end
end
