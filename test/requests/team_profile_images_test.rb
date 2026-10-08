require "test_helper"
class TeamProfileImagesTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "Team pictures", slug: "team-pictures", kind: "private")
    Current.workspace = @workspace
    @user = create_test_user(workspace: @workspace, email: "expert@example.test")
    @endorser = create_test_user(workspace: @workspace, email: "endorser@example.test")
    [@user, @endorser].each { |user| user.profile_picture.attach(io: StringIO.new("image"), filename: "avatar.png", content_type: "image/png") }
    @team = Team.create!(name: "Engineers", owner: @user)
    [@user, @endorser].each { |user| @team.team_users.create!(user: user, status: "accepted") }
    skill = Skill.create!(name: "Ruby")
    user_skill = @user.user_skills.create!(skill: skill, proficiency: "expert")
    SkillEndorsement.create!(user_skill: user_skill, endorser: @endorser, team: @team)
    post "/api/login", params: { auth: { email: @user.email, password: "Password!42" } }
    assert_response :success
  end
  test "insights include profile pictures for experts and both endorsement participants" do
    get "/api/teams/#{@team.id}/insights"
    assert_response :success
    payload = response.parsed_body
    assert_match %r{/rails/active_storage/}, payload["team_experts"].first["profile_picture"]
    %w[endorser endorsee].each do |key|
      assert_match %r{/rails/active_storage/}, payload["recent_endorsements"].first[key]["profile_picture"]
      assert payload["recent_endorsements"].first[key]["avatar_color"]
    end
  end
end
