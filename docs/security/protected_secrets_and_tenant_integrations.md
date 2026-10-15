# Protected secrets and tenant-owned integrations

Google Sheets and Slack connections belong to a workspace. Owners and admins with `integrations.manage` configure them in Settings → Security. Read endpoints return connection status and safe metadata only; replacing or disconnecting a connection requires recent privileged MFA. Web and native routes are `/api/workspace_integrations` and `/api/v1/workspace_integrations`, with PUT/DELETE `/:provider`. Changes create workspace access events without secret values.

Google Sheets consumers resolve credentials from the resource's workspace, including background/MCP exports. The server JSON file is no longer a credential fallback. Slack resolves the issue's workspace connection and ignores `SLACK_WEBHOOK_URL`. An unconfigured workspace cannot borrow another workspace's connection. The application scopes Google tokens to Sheets (read-only when applicable); share only the required spreadsheets with that workspace's service account. Slack webhooks must use the permitted Slack HTTPS hosts. Google credentials cannot override the OAuth token destination.

Keka remains a personal connection within one workspace. New ciphertext is bound to the user, workspace, and base URL. A destination change requires entering the key again. Offboarding and account deletion clear personal credential ciphertext; provider-side key revocation must be done with the provider. Workspace connections remain owned by the workspace after an individual leaves. Legacy Keka records are preserved but disconnected until explicitly migrated.

## Production configuration

Apply database migrations before deploying the new application. Configure the same keyring on every web and worker process, through your deployment secret store:

```text
INTEGRATION_ENCRYPTION_KEYS={"v1":"<64 hex characters from 32 random bytes>"}
INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID=v1
```

Generate a unique random key, for example using `ruby -rsecurerandom -e 'puts SecureRandom.hex(32)'`, and transfer it directly to the secret store. Do not commit it or put it in browser build variables. Back up keys separately from database backups with restricted access. Production refuses integration writes/decryption without the keyring; development/test alone have a domain-separated signing-key fallback. Moving development data to an explicit keyring requires keeping its old key available for migration; do not assume changing environment configuration re-encrypts data automatically.

Integration and Keka values use authenticated AES-256-GCM envelopes with a key version and purpose binding. Vault content now derives a separate encryption key from this keyring. Plaintext vault reads are rejected. Previously encrypted vault records retain read compatibility with the original session-signing/Operations-derived keys; those compatibility keys are never used for new writes. `PROJECT_OPERATIONS_ENCRYPTION_KEY` still independently protects Operations configuration and licenses. The new rotation task does not rotate that separate encryption system.

Platform credentials (billing, Firebase, LiveKit, mail and session signing) remain server deployment secrets. This table is for tenant-owned connections, not a general API for reading deployment secrets. Database encryption does not protect against a compromised application process that already has access to its keys.

## Upgrade existing installations

1. Back up the database and current keys. Run `bundle exec rails db:migrate`.
2. Configure the production keyring on all application processes, retaining old signing, Keka and Operations keys for legacy decryption.
3. Run `bundle exec rails secrets:audit`. It prints counts only. Run `bundle exec rails secrets:rotate` for a read-only verification pass. Investigate failures before proceeding; unreadable ciphertext is preserved.
4. Run `DRY_RUN=false bundle exec rails secrets:rotate` to migrate legacy Keka credentials, rewrap existing connections and encrypt/rewrap vault content. This is resumable and commits each record separately. Repeat the audit and verification pass afterward. Coordinate with writers for a quiet migration window.
5. Assign existing shared Google/Slack credentials only after verifying their actual tenant owner. Prefer fresh provider credentials for each workspace. Configure through Settings, or import ONE explicitly identified workspace using the command below. There is no automatic fan-out to every tenant.

```sh
WORKSPACE_ID=123 ACTOR_ID=456 PROVIDER=google_sheets \
  CREDENTIAL_FILE=/run/secrets/workspace-google.json \
  bundle exec rails secrets:import_workspace
```

`ACTOR_ID` must identify an owner/admin of that workspace with integration permission. Provider is `google_sheets` or `slack`; the file contains service-account JSON or the webhook URL. The operator command uses deployment access, bypasses interactive MFA, and creates an audit event. Restrict access to the host and credential files. Remove obsolete credential mounts after verifying tenant connections. Server service-account JSON files are excluded from Git and Docker build context; if an older image included a key, replace that key with the provider and retire affected images.

## Key rotation

Add a new random key under a new ID while retaining old entries; switch `INTEGRATION_ENCRYPTION_ACTIVE_KEY_ID` to that ID on all writers. Run the dry-run and explicit write rotation above, then verify workflows and restore procedures. Keep old keys until all records, deployments, rollback images, and retained database backups that need them have been handled. Removing a required key makes those records unreadable; it does not revoke provider credentials. Provider rotation requires replacing the saved connection and revoking the old key/webhook at the provider.

Vault legacy decryption also depends on the old signing/Operations key. Rewrap before retiring those old values. Keep legacy Keka decryption configuration until every applicable user has migrated or intentionally disconnected. A successful read-only pass alone does not rewrite any records.

## Exposure controls and verification

Settings never fetches saved secrets and clears entered values after submission. User and connection serialization exclude ciphertext; Keka masks have constant length. Parameter and event logs filter credential fields, suppress provider exception bodies, and omit spreadsheet row contents. Cached Keka profile payloads filter sensitive keys and known key values. Arbitrary non-secret application content is not a general-purpose secret store.

Tests cover tenant/provider/destination binding, key retention and missing keys, write-only APIs, owner/admin permission and recent MFA, native endpoints, Google/Slack tenant selection without global fallback, credential validation, log filtering, strict vault backfill, and offboarding cleanup. External Google/Slack/Keka requests are mocked; verify actual provider permissions with a test workspace before enabling production connections. Publishing and production key provisioning are separate operator actions.
