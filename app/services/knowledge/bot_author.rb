module Knowledge
  class BotAuthor
    def self.for_workspace!(workspace)
      workspace.with_lock do
        workspace.users.find_by(system_bot: true) || workspace.users.create!(
          system_bot: true, email: "knowledge-bot-#{SecureRandom.uuid}@bot.invalid",
          password: SecureRandom.hex(48), first_name: "Knowledge", last_name: "Bot",
          job_title: "AI knowledge assistant", status: "locked", confirmed_at: Time.current
        )
      end
    end
  end
end
