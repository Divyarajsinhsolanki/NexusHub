require 'test_helper'
require 'minitest/mock'

class PrivacyRequestManagementTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: 'Privacy operator', slug: 'privacy-operator', kind: 'private')
    @owner = create_test_user(workspace: @workspace, email: 'privacy-owner@example.test')
    Current.set(workspace: @workspace) { @owner.roles << Role.find_by!(name: 'owner') }
    @operator = create_test_user(workspace: @workspace, email: 'privacy-operator@example.test')
    @operator.update_column(:site_admin, true)
    @record = PrivacyRequest.new(request_type: 'erasure', status: 'received', email_verified_at: Time.current)
    @record.payload = { 'email' => 'former-employee@example.test', 'details' => 'Sensitive request' }
    @record.save!
  end

  test 'workspace owners cannot access or edit the operator queue or use generic admin endpoints' do
    login(@owner)
    get '/api/privacy_request_management'
    assert_response :forbidden
    patch "/api/privacy_request_management/#{@record.reference}", params: { privacy_request: update_params }, as: :json
    assert_response :forbidden
    get '/api/admin/privacy_requests'
    assert_response :unprocessable_entity
    assert_equal 'received', @record.reload.status
  end

  test 'operator review requires recent MFA identity basis response and optimistic locking' do
    login(@operator)
    travel 11.minutes do
      get '/api/privacy_request_management'
      assert_response :forbidden
      assert_equal 'mfa_step_up_required', response.parsed_body['error']
    end
    get '/api/privacy_request_management'
    assert_response :success
    assert_includes response.body, 'Sensitive request'
    patch "/api/privacy_request_management/#{@record.reference}", params: { privacy_request: update_params.merge(identity_verified: false) }, as: :json
    assert_response :unprocessable_entity
    patch "/api/privacy_request_management/#{@record.reference}", params: { privacy_request: update_params.merge(lock_version: 99) }, as: :json
    assert_response :conflict
    assert_no_difference 'User.count' do
      assert_enqueued_with(job: ActionMailer::MailDeliveryJob) do
        patch "/api/privacy_request_management/#{@record.reference}", params: { privacy_request: update_params }, as: :json
      end
    end
    assert_response :success
    assert_equal 'completed', @record.reload.status
    assert @record.identity_verified_at
    assert @record.closed_at
    patch "/api/privacy_request_management/#{@record.reference}", params: { privacy_request: update_params }, as: :json
    assert_response :unprocessable_entity
    assert_equal @operator.id, @record.privacy_request_events.last.actor_id
    refute_includes response.body, 'Internal evidence'
    refute_includes @record.payload_ciphertext, 'Internal evidence'
  end

  test 'unverified and closed requests cannot be processed and generic admin excludes privacy models for site admins' do
    login(@operator)
    @record.update!(email_verified_at: nil, status: 'pending_verification')
    patch "/api/privacy_request_management/#{@record.reference}", params: { privacy_request: update_params }, as: :json
    assert_response :unprocessable_entity
    get '/api/admin/privacy_requests'
    assert_response :unprocessable_entity
    get '/api/admin/privacy_request_events'
    assert_response :unprocessable_entity
  end

  test 'a failed notification preserves the saved response and reports delivery failure' do
    login(@operator)
    delivery = Object.new
    def delivery.deliver_later = raise(ActiveJob::EnqueueError, 'Unavailable')
    PrivacyRequestMailer.stub(:status_changed, delivery) do
      patch "/api/privacy_request_management/#{@record.reference}", params: { privacy_request: update_params }, as: :json
    end
    assert_response :success
    assert_equal false, response.parsed_body['notification_queued']
    assert_equal 'completed', @record.reload.status
    assert_equal update_params[:response], @record.payload['response']
  end

  private

  def login(user)
    post '/api/login', params: { auth: { email: user.email, password: 'Password!42' } }
    complete_test_mfa
    assert_response :success
  end

  def update_params
    { status: 'completed', identity_verified: true, response: 'Reviewed; see the agreed secure delivery channel.', operator_note: 'Internal evidence: established account verified.', lock_version: @record.lock_version }
  end
end
