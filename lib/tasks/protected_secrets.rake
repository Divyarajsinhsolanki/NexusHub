namespace :secrets do
  desc "Read-only inventory; prints counts only, never credential values"
  task audit: :environment do
    counts = {
      legacy_keka: User.where(keka_secret_ciphertext: nil).where.not(encrypted_keka_api_key: [nil, ""]).count,
      workspace_connections: WorkspaceIntegration.unscoped.where(revoked_at: nil).count,
      plaintext_vault: 0
    }
    [Item, ProjectVaultItem].each do |type|
      type.unscoped.find_each { |record| counts[:plaintext_vault] += 1 unless record.encrypted_attribute?(:content) }
    end
    puts JSON.generate(counts)
  end

  desc "Import a credential into ONE explicitly selected workspace; requires owner/admin ACTOR_ID, WORKSPACE_ID, PROVIDER, CREDENTIAL_FILE"
  task import_workspace: :environment do
    workspace = Workspace.find(ENV.fetch("WORKSPACE_ID"))
    actor = workspace.users.find(ENV.fetch("ACTOR_ID"))
    abort "Actor must have integration management permission" unless WorkspaceAuthorization.allowed?(actor, "integrations.manage", workspace:)
    provider = ENV.fetch("PROVIDER")
    abort "Unsupported provider" unless WorkspaceIntegration::PROVIDERS.include?(provider)
    value = File.read(ENV.fetch("CREDENTIAL_FILE"), 32.kilobytes + 1)
    Current.set(user: actor, workspace:) do
      workspace.with_lock do
        record = WorkspaceIntegration.in_workspace(workspace).find_or_initialize_by(provider:)
        record.workspace = workspace
        record.replace_secret!(value)
        WorkspaceAccessEvent.create!(workspace:, actor:, action: "integration.imported", details: { provider: })
      end
    end
    puts "Imported provider=#{provider} workspace_id=#{workspace.id}"
  rescue StandardError => error
    abort "Import failed (#{error.class.name}); no credential is printed."
  end

  desc "Migrate legacy Keka credentials and rewrap integrations/vault; DRY_RUN defaults true, retain old keys until verification"
  task rotate: :environment do
    dry_run = ENV.fetch("DRY_RUN", "true") != "false"
    Integrations::SecretBox.encrypt("preflight", context: "rotation-preflight")
    counts = { verified: 0, updated: 0, failed: 0, dry_run: }
    [WorkspaceIntegration, User, Item, ProjectVaultItem, PrivacyRequest].each do |type|
      scope = type.unscoped
      scope = scope.where.not(payload_ciphertext: nil) if type == PrivacyRequest
      scope = scope.where.not(secret_ciphertext: nil) if type == WorkspaceIntegration
      scope = scope.where.not(keka_secret_ciphertext: nil).or(scope.where.not(encrypted_keka_api_key: [nil, ""])) if type == User
      scope.find_each do |record|
        record.with_lock do
          case record
          when WorkspaceIntegration
            next if record.revoked_at
            value = record.secret
            unless dry_run
              record.update!(secret_ciphertext: Integrations::SecretBox.encrypt(value, context: record.secret_context))
            end
          when PrivacyRequest
            value = record.payload
            unless dry_run
              record.payload = value
              record.save!
            end
          when User
            value = record.keka_secret_ciphertext.present? ? record.keka_api_key : record.legacy_keka_api_key
            raise Integrations::SecretBox::Unavailable if value.blank?
            record.update!(keka_api_key: value, keka_profile_data: Integrations::Redactor.call(record.keka_profile_data || {}, known_secrets: [value])) unless dry_run
          else
            value = record.encrypted_attribute?(:content) ? record.content : record.read_attribute_before_type_cast(:content)
            record.update_columns(content: value) unless dry_run
          end
          counts[:verified] += 1
          counts[:updated] += 1 unless dry_run
        end
      rescue StandardError
        counts[:failed] += 1
        warn "Preserved unreadable record type=#{type.name} id=#{record.id}"
      end
    end
    puts JSON.generate(counts)
    abort "Some records could not be read; keep old keys and review them before retiring any key." if counts[:failed].positive?
  end
end
