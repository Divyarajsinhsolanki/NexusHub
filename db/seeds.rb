# Keep the default seed intentionally small and safe for every environment.
# `app:bootstrap` composes this baseline with portfolio and synthetic demo data.

Role::NAMES.each { |name| Role.find_or_create_by!(name: name) }

Workspace.regular!

puts "Seeded baseline roles and the Nexus Hub workspace."
