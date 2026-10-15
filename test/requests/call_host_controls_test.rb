require 'test_helper'
require 'minitest/mock'
class CallHostControlsTest < ActionDispatch::IntegrationTest
  setup do
    @workspace=Workspace.create!(name:'Host controls',slug:'host-controls',kind:'private')
    Current.workspace=@workspace
    @host=create_test_user(workspace:@workspace,email:'host-controls@example.test')
    @guest=create_test_user(workspace:@workspace,email:'guest-controls@example.test')
    conversation=Conversation.create!(workspace:@workspace,creator:@host,conversation_type:'group',title:'Controls')
    [@host,@guest].each{|user|conversation.conversation_participants.create!(workspace:@workspace,user:user)}
    @call=conversation.call_sessions.create!(workspace:@workspace,initiator:@host,call_type:'video',status:'active',started_at:Time.current,livekit_room_name:'host-controls-room')
    [@host,@guest].each{|user|@call.call_participants.create!(workspace:@workspace,user:user,status:'joined',joined_at:Time.current)}
    @previous=ENV.to_h.slice('LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET')
    ENV['LIVEKIT_URL']='ws://media.example.test';ENV['LIVEKIT_API_KEY']='key';ENV['LIVEKIT_API_SECRET']='secret'
  end
  teardown do
    %w[LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET].each{|key|@previous.key?(key) ? ENV[key]=@previous[key] : ENV.delete(key)}
  end
  test 'transfer preserves initiator, grants the new host controls and revokes the old host' do
    login(@host)
    post "/api/calls/#{@call.id}/host_action",params:{host_action:'transfer_host',user_id:@guest.id}
    assert_response :success
    assert_equal @guest.id,@call.reload.host_user_id
    assert_equal @host.id,@call.initiator_id
    assert_equal false,JSON.parse(response.body).dig('call_session','can_end')
    post "/api/calls/#{@call.id}/end"
    assert_response :forbidden
    post "/api/calls/#{@call.id}/host_action",params:{host_action:'mute',user_id:@guest.id}
    assert_response :forbidden
    login(@guest)
    post "/api/calls/#{@call.id}/end"
    assert_response :success
  end
  test 'mute affects only microphone tracks and never remotely unmutes' do
    login(@host);requests=[]
    Chat::LivekitRoomPresence.stub(:request, ->(_session,method,body){requests<<[method,body];method=='GetParticipant' ? {'tracks'=>[{'sid'=>'mic','source'=>'MICROPHONE'},{'sid'=>'cam','source'=>'CAMERA'}]} : {}}) do
      post "/api/calls/#{@call.id}/host_action",params:{host_action:'mute',user_id:@guest.id}
    end
    assert_response :success
    assert_equal 'mic',requests.last[1][:track_sid]
    assert_equal true,requests.last[1][:muted]
    assert_equal 2,requests.length
  end
  test 'removal disconnects and denies direct and link rejoin with old and new clients' do
    login(@host)
    Chat::LivekitRoomPresence.stub(:request,{}) do
      post "/api/calls/#{@call.id}/host_action",params:{host_action:'remove',user_id:@guest.id}
    end
    assert_response :success
    assert @call.call_participants.find_by!(user:@guest).removed_at
    login(@guest)
    [false,true].each do |confirmation|
      post "/api/calls/#{@call.id}/join",params:{media_confirmation_required:confirmation}
      assert_response :unprocessable_entity
      post "/api/meet/#{@call.public_id}/join",params:{media_confirmation_required:confirmation}
      assert_response :unprocessable_entity
    end
    post "/api/calls/#{@call.id}/media_heartbeat"
    assert_response :unprocessable_entity
  end
  test 'non-host and unrelated users cannot moderate and failed media action keeps membership' do
    login(@guest)
    post "/api/calls/#{@call.id}/host_action",params:{host_action:'remove',user_id:@host.id}
    assert_response :forbidden
    login(@host)
    Chat::LivekitRoomPresence.stub(:request,->(*){raise Chat::LivekitRoomPresence::Unavailable,'Offline'}) do
      post "/api/calls/#{@call.id}/host_action",params:{host_action:'remove',user_id:@guest.id}
    end
    assert_response :service_unavailable
    assert_nil @call.call_participants.find_by!(user:@guest).removed_at
    outsider=create_test_user(workspace:@workspace,email:'outsider-controls@example.test')
    login(outsider)
    post "/api/calls/#{@call.id}/host_action",params:{host_action:'transfer_host',user_id:@guest.id}
    assert_response :not_found
  end
  test 'mobile endpoint enforces the same host permissions and cross-workspace transfer denial' do
    session, = MobileSession.issue_for!(user: @host)
    headers = {'Authorization' => "Bearer #{MobileAccessToken.issue(session)[:token]}"}
    post "/api/v1/calls/#{@call.id}/host_action",params:{host_action:'transfer_host',user_id:@guest.id},headers:headers
    assert_response :success
    assert_equal @guest.id,JSON.parse(response.body).dig('data','call_session','host_id')
    post "/api/v1/calls/#{@call.id}/host_action",params:{host_action:'remove',user_id:@guest.id},headers:headers
    assert_response :forbidden
    external=Workspace.create!(name:'Outside host',slug:'outside-host',kind:'private')
    Current.workspace=external
    external_user=create_test_user(workspace:external,email:'outside-host@example.test')
    Current.workspace=@workspace
    @call.call_participants.create!(workspace:@workspace,user:external_user,status:'joined',joined_at:Time.current)
    login(@guest)
    post "/api/calls/#{@call.id}/host_action",params:{host_action:'transfer_host',user_id:external_user.id}
    assert_response :unprocessable_entity
    assert_equal @guest.id,@call.reload.host_user_id
  end

  private
  def login(user)
    post '/api/login',params:{auth:{email:user.email,password:'Password!42'}}
    complete_test_mfa
    assert_response :success
  end
end
