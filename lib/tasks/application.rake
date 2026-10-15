namespace :app do
  desc "Prepare the database and seed all required application data"
  task bootstrap: ["recovery:migration_preflight", "db:prepare", "app:seed"]

  desc "Seed baseline, portfolio, and optional synthetic demo data"
  task seed: :environment do
    boolean = ActiveModel::Type::Boolean.new
    seed_portfolio = boolean.cast(ENV.fetch("SEED_PORTFOLIO", "true"))
    seed_demo = boolean.cast(ENV.fetch("SEED_DEMO", "true"))

    puts "== Seeding baseline data =="
    Rails.application.load_seed

    if seed_portfolio
      profile = PortfolioSeeder.new.call
      puts "Seeded portfolio for #{profile.full_name}."
    else
      puts "Skipped portfolio data (SEED_PORTFOLIO=false)."
    end

    if seed_demo
      workspace = DemoWorkspaceSeeder.new.call
      puts "Seeded synthetic demo workspace: #{workspace.name} (#{workspace.slug})."
    else
      puts "Skipped demo data (set SEED_DEMO=true to include it)."
    end

    puts "Application bootstrap complete."
  end
end
