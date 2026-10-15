# Synthetic data only. This file never runs against an existing application DB.
abort 'Disposable drill database required' unless ENV['DEPLOYMENT_TIER'] == 'restore' && ActiveRecord::Base.connection_db_config.database.match?(/_restore_source[a-f0-9]+\z/)
Role::NAMES.each { |name| Role.find_or_create_by!(name:) }
workspace = Workspace.create!(name: 'Synthetic recovery workspace', slug: 'synthetic-recovery', kind: 'private')
Current.set(workspace:) do
  user = workspace.users.create!(email: 'recovery@example.invalid', password: SecureRandom.hex(24),
    first_name: 'Synthetic', last_name: 'Recovery', job_title: 'Drill fixture', status: 'active', confirmed_at: Time.current)
  Current.user = user
  user.items.create!(workspace:, title: 'Recovery fixture', content: 'synthetic vault secret')
  project = Project.create!(workspace:, owner: user, name: 'Synthetic recovery project')
  project.project_users.create!(workspace:, user:, role: 'owner')
  environment = project.project_environments.create!(workspace:, name: 'Synthetic')
  project.project_vault_items.create!(workspace:, title: 'Project recovery fixture', content: 'synthetic project secret')
  configuration = project.project_operation_items.create!(workspace:, kind: 'configuration', name: 'DRILL_KEY')
  project.project_operation_entries.create!(workspace:, project_operation_item: configuration, project_environment: environment, value: 'synthetic configuration')
  project.project_operation_items.create!(workspace:, kind: 'license', name: 'Synthetic license', license_key: 'synthetic license key', details: { owner_id: user.id, time_zone: 'Etc/UTC' })
  user.update!(keka_base_url: 'https://synthetic.keka.com', keka_employee_id: 'FIXTURE', keka_api_key: 'synthetic-key')
  connection = WorkspaceIntegration.create!(workspace:, provider: 'slack')
  connection.replace_secret!('https://hooks.slack.com/services/T/B/synthetic')
  request = PrivacyRequest.new(request_type: 'access')
  request.payload = { 'email' => 'rights@example.invalid', 'details' => 'Synthetic rights request' }
  request.save!
  ActiveStorage::Blob.create_and_upload!(io: StringIO.new('synthetic private upload'), filename: 'recovery.txt', content_type: 'text/plain', service_name: 'local')
end
puts 'Synthetic recovery fixtures created.'
