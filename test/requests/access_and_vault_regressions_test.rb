require 'test_helper'

class AccessAndVaultRegressionsTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: 'Access regressions', slug: 'access-regressions', kind: 'private')
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: 'access-regressions@example.test')
    @other = create_test_user(workspace: @workspace, email: 'access-other@example.test')
    Current.user = @user
    @project = Project.create!(name: 'Owned project', owner: @user)
    @team = Team.create!(name: 'Unrelated team', owner: @other)
    @goal = @user.learning_goals.create!(title: 'Personal goal')
    Current.reset_all
    post '/api/login', params: { auth: { email: @user.email, password: 'Password!42' } }
    assert_response :success
  end

  test 'team leaders cannot modify unrelated teams but can manage owned teams' do
    in_workspace { @user.roles << Role.find_by!(name: 'team_leader') }
    patch "/api/teams/#{@team.id}", params: { team: { name: 'Denied' } }
    assert_response :forbidden
    delete "/api/teams/#{@team.id}"
    assert_response :forbidden
    own = in_workspace { Team.create!(name: 'Owned team', owner: @user) }
    patch "/api/teams/#{own.id}", params: { team: { description: 'Allowed' } }
    assert_response :success
  end

  test 'learning goals cannot move to unrelated or invited teams' do
    patch "/api/learning_goals/#{@goal.id}", params: { learning_goal: { team_id: @team.id } }
    assert_response :forbidden
    membership = in_workspace { @team.team_users.create!(user: @user, status: 'invited') }
    patch "/api/learning_goals/#{@goal.id}", params: { learning_goal: { team_id: @team.id } }
    assert_response :forbidden
    membership.update!(status: 'accepted')
    patch "/api/learning_goals/#{@goal.id}", params: { learning_goal: { team_id: @team.id } }
    assert_response :success
    assert_equal @team.id, @goal.reload.team_id
  end

  test 'invalid checkpoints roll back the entire goal creation' do
    assert_no_difference ['LearningGoal.unscoped.count', 'LearningCheckpoint.unscoped.count'] do
      post '/api/learning_goals', params: { learning_goal: { title: 'Atomic goal', checkpoints: [{ title: 'Valid' }, { title: '' }] } }, as: :json
      assert_response :unprocessable_entity
    end
    post '/api/learning_goals', params: { learning_goal: { title: 'Valid goal', checkpoints: [{ title: 'First' }, { title: 'Second' }] } }, as: :json
    assert_response :created
    assert_equal 2, response.parsed_body['checkpoints'].length
  end

  test 'project owners without membership receive authoritative access flags' do
    get "/api/projects/#{@project.id}"
    assert_response :success
    assert_equal true, response.parsed_body['can_access']
    assert_equal true, response.parsed_body['can_manage']
    post '/api/v1/auth/login', params: { auth: { email: @user.email, password: 'Password!42', device_name: 'Access tests' } }
    token = response.parsed_body.dig('data', 'access_token')
    get "/api/v1/projects/#{@project.id}", headers: { 'Authorization' => "Bearer #{token}" }
    assert_response :success
    assert_equal true, response.parsed_body.dig('data', 'can_access')
    assert_equal true, response.parsed_body.dig('data', 'can_edit')
  end

  test 'vault writes are encrypted at rest while authorized reads and search still work' do
    post '/api/items', params: { item: { title: 'Private', category: 'Credential', content: 'sensitive-needle' } }
    assert_response :created
    id = response.parsed_body['id']
    raw = Item.connection.select_value("SELECT content FROM items WHERE id = #{id.to_i}")
    assert_not_includes raw, 'sensitive-needle'
    assert_equal 'sensitive-needle', response.parsed_body['content']
    get '/api/items', params: { q: 'needle' }
    assert_response :success
    assert_equal [id], response.parsed_body['items'].map { |row| row['id'] }
    post "/api/projects/#{@project.id}/vault_items", params: { project_vault_item: { title: 'Project credential', category: 'Credential', content: 'project-needle' } }
    assert_response :created
    project_id = response.parsed_body['id']
    raw = ProjectVaultItem.connection.select_value("SELECT content FROM project_vault_items WHERE id = #{project_id.to_i}")
    assert_not_includes raw, 'project-needle'
    get "/api/projects/#{@project.id}/vault_items", params: { q: 'needle' }
    assert_equal [project_id], response.parsed_body['items'].map { |row| row['id'] }
  end

  test 'legacy vault contents are readable and backfill is idempotent' do
    record = in_workspace { @user.items.create!(title: 'Legacy', content: 'old-secret') }
    Item.connection.execute("UPDATE items SET content = 'legacy-secret' WHERE id = #{record.id.to_i}")
    assert_equal 'legacy-secret', record.reload.content
    require Rails.root.join('db/migrate/20270823000000_encrypt_existing_vault_contents')
    2.times { EncryptExistingVaultContents.new.up }
    raw = Item.connection.select_value("SELECT content FROM items WHERE id = #{record.id.to_i}")
    assert_not_includes raw, 'legacy-secret'
    assert_equal 'legacy-secret', record.reload.content
  end

  def in_workspace(&block)
    Current.set(workspace: @workspace, user: @user, &block)
  end
end
