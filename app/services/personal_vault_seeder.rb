class PersonalVaultSeeder
  EXAMPLES = {
    "Credential" => ["Staging review login", "QA sample login", "Recovery practice login"],
    "Command" => ["Local app startup", "Database preparation", "Frontend tests"],
    "Token" => ["API token placeholder", "Webhook token placeholder", "Monitoring token placeholder"],
    "Note" => ["Release checklist", "Team onboarding", "Incident handoff"]
  }.freeze

  def call(user:)
    previous_workspace, previous_user = Current.workspace, Current.user
    Current.workspace, Current.user = user.workspace, user
    EXAMPLES.each do |category, titles|
      titles.each_with_index do |title, index|
        content = case category
        when "Credential" then "Synthetic username: demo-reviewer-#{index + 1}\nPassword: demo-only-no-real-access"
        when "Command" then ["bin/dev", "bin/rails db:prepare", "npm test"][index]
        when "Token" then "demo-only-token-#{index + 1}-not-a-real-secret"
        else "Synthetic #{title.downcase}: review ownership, check the environment, and record the outcome."
        end
        Item.find_or_create_by!(user: user, title: "Demo: #{title}") do |item|
          item.assign_attributes(category: category, content: content)
        end
      end
    end
  ensure
    Current.workspace, Current.user = previous_workspace, previous_user
  end
end
