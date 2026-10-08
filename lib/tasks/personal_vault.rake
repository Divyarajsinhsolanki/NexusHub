namespace :vault do
  desc "Add synthetic personal Vault examples for an explicitly selected user (USER_ID=...)"
  task seed: :environment do
    user = User.unscoped.find(ENV.fetch("USER_ID"))
    PersonalVaultSeeder.new.call(user: user)
    puts "Seeded synthetic personal Vault examples for #{user.full_name}."
  end
end
