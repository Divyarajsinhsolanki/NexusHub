# Staging, offsite backups, restore drills, and migration recovery

> Current zero-customer rollout exception: see [temporary direct production deployment](prelaunch_direct_production.md). EB auto-deploys successful main pushes without staging, and explicitly opts out of offsite migration-receipt enforcement for now. The stricter staged/backup procedures below describe the configuration to restore before customer onboarding.


## Operating targets and ownership

Initial operating targets are a database/files RPO of 24 hours and a service RTO of 4 hours. These are targets to measure, not guarantees established by the tiny synthetic drill. Take a fresh recovery point within one hour before a migration. Run a synthetic drill monthly and after recovery-tool changes; run a controlled restore from the actual offsite account at least quarterly and after changing storage, keys, or database major version. Record the incident/release owner, backup operator, recovery-key custodians, last successful real offsite restore, elapsed time, measured data loss, exceptions, and approval to reopen traffic in the deployment's restricted operations log.

The repository now supplies an isolated staging stack, database-and-file backup tool, encrypted offsite transport, immutable bucket template, guarded releases, restore/application verification, a repeatable synthetic drill and migration failure rehearsal. This change does not provision cloud resources, transfer production data, send live mail or enable a hosted environment. GitHub environments, keys, roles, monitoring destinations and retention decisions must be configured by the deployment owner.

## Staging uses production code with separate resources

Use `RAILS_ENV=production` with `DEPLOYMENT_TIER=staging`; do not create a divergent Rails staging environment. Use the standalone `docker-compose.staging.yml`, not an override merged into production:

```sh
cp .env.staging.example .env.staging
# Supply freshly generated independent keys/passwords in that ignored file.
bin/staging config --quiet
bin/staging up --build --detach --wait
```

The project owns separate PostgreSQL, Redis, file and Caddy volumes. Rails web/workers/DB/Redis use an internal Docker network; ingress is loopback-only HTTPS at `https://nexus-staging.localhost:8443`. Caddy uses an internal CA; trust that CA locally before browser verification. Never disable TLS verification in deployed clients. Captured mail is available on loopback port 8025. No real SMTP credentials, billing, cloud-storage, AWS, calling, push or diagnostics credentials belong in the staging env. Boot checks reject common live-provider credentials, production-looking DB names, missing isolation confirmation and unsafe mail configuration. Network isolation is the main outbound boundary; the environment-name checks do not prove that an operator supplied an independently hosted resource.

Build the staging image from the checkout, with external browser integrations disabled. Do not reuse an image compiled with production Firebase/Sentry/other public client configuration. The default seed creates baseline roles plus the existing synthetic demo workspace; production exports must never be imported into this staging stack. For a hosted staging environment, preserve this network boundary and mail capture, use separately provisioned resources/keys and a staging-named host, and restrict ingress through your VPN or identity proxy. A hosted staging DNS/certificate is not provisioned here.

Before promotion, exercise sign-in and MFA, cross-workspace denials, invitation/offboarding, rights-request verification in Mailpit, encrypted settings, private downloads, one queued PDF, ordinary worker delivery, and web/mobile API errors. Check `/up`, worker logs and queue prefixes. Sidekiq/Cable namespaces include the deployment tier. Billing/live integrations stay disabled in this stack. The health endpoint is a process probe, not a database, restore or legal-readiness check.

## Offsite account and key setup

Deploy `infrastructure/recovery/offsite-backup-bucket.json` through your normal reviewed infrastructure process in a **separate recovery account**, preferably a separate region. The template is reviewable, not auto-applied. It creates a private versioned KMS-encrypted S3 bucket, default 35-day COMPLIANCE Object Lock, 90-day lifecycle and retained bucket/key resources. Object Lock can prevent deletion even by administrators during retention; approve storage cost and retention obligations before provisioning. It cannot be treated as an immediately reversible toggle. See [AWS Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html).

Provide explicit backup-writer and recovery-reader role ARNs. The template grants prefix-scoped write/verification access, denies writer deletion, and gives the separate recovery reader versioned retrieval. Source-account role identity policies must also allow the same bucket/KMS actions; cross-account resource policy alone is insufficient. Use a dedicated read-only PostgreSQL backup role with SELECT on all application tables and sequences and default privileges for future migrations. Set both `DATABASE_URL` and `BACKUP_DATABASE_URL` in the backup-only env to that same source; role identity is excluded from the database fingerprint, so release verification still matches. Writer operations need bucket versioning/Object Lock reads; object PutObject, PutObjectRetention, GetObjectVersion and GetObjectRetention; and the KMS permissions in the template. KMS use is limited through S3. The writer can read encrypted backup objects but never receives the GPG private key. The reader needs version retrieval and KMS decrypt plus separately controlled GPG escrow. Enable CloudTrail/access auditing and notify on configuration/retention/key-policy changes.

Generate a passphrase-protected recovery encryption key on the recovery workstation (for example GPG RSA3072), export the public recipient to the app host, and escrow the private key and passphrase separately with tested access for at least two authorized custodians. Do not generate a production private key on the app host or commit key exports. Synthetic drills generate disposable keys solely for fixtures. GPG provides backup encryption independent of the app host's secrets; S3 adds transport checksum, versioning, KMS encryption and retention.

Escrow a versioned configuration/key bundle separately from database backups: Rails credentials/master/signing keys, JWT signing keys, all retained integration keyring versions, legacy Keka/legacy vault dependencies, the independent Operations key, database/provider recovery access, image/commit identifier, deployment manifests and DNS/host configuration. Record its non-secret version in `BACKUP_KEYSET_ID`. Never put the key bundle in the backup manifest, application image, logs or writer bucket permissions. A successful database restore with missing application keys is not service recovery.

## What a backup contains

`bundle exec rails recovery:backup` with `BACKUP_UPLOAD_MODE=active_storage` takes a PostgreSQL exported snapshot, records public-schema table counts and migration versions, and produces a custom-format `pg_dump` from that same snapshot. It captures every blob listed in the snapshot, including unattached blobs, through its configured private Active Storage service and verifies byte length and stored checksum. Each copied file and the dump also receive SHA-256 checksums. Files are stored in Disk-service layout so a drill never needs to reconnect to or purge production object storage. Keys remain encrypted in the SQL dump; restoring their readability requires the separate escrowed application keys.

Active Storage keys must retain their immutable content. Concurrent creation is safe because the DB snapshot defines the inventory. A concurrent purge before download, missing object, unsupported/missing blob checksum, changed bytes, dump failure, encryption failure or upload failure aborts success. Investigate repeated failures; schedule a quiet/quiesced window if purges race the capture. A database snapshot does not back up arbitrary host files, legacy upload quarantine, provider objects missing from blob metadata, PostgreSQL roles, WAL/PITR, Redis queues or provider-side state. Back up the private legacy quarantine and any such state separately before retiring its host. Use provider PITR for a tighter RPO; these logical dumps do not implement WAL archiving.

The manifest includes schema versions, release identifier, keyset identifier, source DB fingerprint, table counts and file inventory. It contains no key material and is encrypted inside the bundle. A small offsite receipt contains backup checksums, exact S3 object version, source fingerprint and recovery references, without record content. After S3 confirms the object's SHA-256, version, size and lock mode, the tool uploads and verifies the receipt too. Only then does it atomically advance local `latest.json` and prune old locally verified copies. Failed attempts keep the preceding success receipt. There is no remote-delete operation in this tool.

Single-object uploads are limited to less than 5 GiB; larger installations need a reviewed multipart/managed-backup design. Provision scratch capacity for the dump, copied uploads, plaintext tar, encrypted output and restore expansion. Scratch directories are private and removed on normal completion/failure, but process kill/power loss can leave them: use encrypted disks with access restricted to the service user and clean abandoned work directories after investigation. This is not secure-erasure software. Cap scratch volumes and backup CPU/I/O; the EB service template has a two-hour deadline. Use matching-or-newer supported `pg_dump` and compatible `pg_restore`, never an older client against a newer server. See [PostgreSQL dump](https://www.postgresql.org/docs/16/app-pgdump.html) and [restore](https://www.postgresql.org/docs/16/app-pgrestore.html).

Standalone `bin/recovery backup`/`Dockerfile.backup` support `local` mode with `BACKUP_UPLOAD_ROOT` and `BACKUP_WRITES_QUIESCED=true`, or `external` mode with a separately verified `BACKUP_UPLOAD_RECOVERY_REFERENCE`. The external mode is intentionally database-only and does not claim upload recovery. Use the Rails task's `active_storage` mode for a complete referenced-file bundle. Local-only fixture runs require `BACKUP_LOCAL_ONLY=true`, never produce an offsite-verified receipt and cannot satisfy production migration preflight.

## Scheduling and monitoring

For Compose, copy `.env.backup.example` to ignored `.env.backup`, set offsite bucket/region/expected account/KMS key/keyset values, configure role credentials for the backup containers, set `BACKUP_PUBLIC_KEY_PATH` and `APP_REVISION` in the deployment environment, then use the reviewed `bin/deploy`. The app image now includes PG tools, GPG and AWS CLI. Backup-only credentials belong only in the backup environment, not browser variables. If using a mounted AWS shared-credentials file, add a read-only mount to the backup services; an env path by itself does not mount a file. Prefer a restricted workload role.

The first named-volume creation gives `/backups` to the Rails user. Existing root-owned volumes from the legacy backup job need an explicit ownership/permission correction before rollout; inspect and retain their old dumps. A persistent `app-files` volume is shared by web/workers and read-only by backup, covering deployments that use local uploads. Move any existing container-local files into that volume in a controlled maintenance window; mounting an empty volume does not migrate old files.

`pre_release_backup` performs a fresh capture before release. The daily backup service exits/restarts on failure and its healthcheck rejects a missing or older-than-26-hour verified receipt. A backup flock prevents concurrent writers. `bin/recovery check /backups/latest.json` is an exit-code probe suitable for a host monitor. Docker marks unhealthy containers but does not send notifications by itself: configure an external monitor/alert route and test it by withholding a synthetic receipt. Also alert on backup service failures, disk pressure, missing offsite objects and a missed quarterly real-restore drill. An external recovery-account monitor must list/check recent receipt/object versions too: if the application host is down, its local probe is unavailable. No external alert destination is configured by this repository.

For EB, install matching PostgreSQL clients, GPG and AWS CLI, create a private writer directory and public-key mount, and review/install the supplied `nexus-backup.service` and timer under systemd. Set `/etc/nexus/backup.env` (restricted permissions) with offsite config, `BACKUP_DIRECTORY`, public recipient path, keyset/release identifiers and receipt path; inject the deployed app environment through the supplied runner. The release hook enforces the same migration guard. EB does not gain a working offsite scheduler merely from the template being present; install/enable it and verify a completed real backup before deployment. Export `BACKUP_RECEIPT_PATH` in EB app properties to the verified receipt. Preserve known-good immutable image/source artifacts in a separately accessible registry/repository.

## Production release and migration recovery

`app:bootstrap`, `bin/release` and the normal direct `db:migrate` path now require a fresh offsite-verified receipt matching this database and its current migration versions in production. A receipt from another DB, one older than one hour, a local-only backup or a stale schema is rejected. Receipt directories must be writable only by the trusted backup process and mounted read-only into releases; this is not a cryptographic attestation against a compromised host administrator. Direct SQL and alternate Rails tasks are not made safe by this guard.

First bootstrap is allowed only when the DB already exists, has no public application tables, and `INITIAL_DATABASE_NAME` explicitly equals its name. Remove that flag after bootstrap and verify the first offsite backup. Nonempty databases never get this exemption. Synthetic staging skips the production receipt requirement; restore-tier migration rehearsals require `MIGRATION_REHEARSAL=true`. The ordinary production rollback/down tasks are blocked; do not bypass this to guess at a destructive rollback.

`bin/deploy` builds before downtime, records the existing web image identity for the recovery manifest when available, pauses ingress/web/workers/daily backup, captures an offsite recovery point, and runs guarded migrations before starting services. If backup or migration fails it stops with writers paused; it deliberately does not auto-reopen traffic or run `db:rollback`. This is a single-host maintenance workflow, not a zero-downtime rolling deploy. Coordinate all external writers/instances before using it on a cluster. Expand/contract schema changes remain the preferred approach for compatible rolling deployments.

The EB GitHub workflow is manual, defaults to staging, and uses separate GitHub environments with an explicit `EB_ENVIRONMENT` variable. Configure environment-scoped credentials, protected branches and production required reviewers in GitHub; the YAML alone cannot create those protections. Production no longer deploys automatically on every push. Run CI and staging verification before invoking it. On EB, take the fresh backup while writers are paused before the predeploy release hook; the hook does not itself stop all HTTP writers or create a provider snapshot.

On a failed migration:

1. Keep traffic and all workers paused. Preserve logs and the failed database. Record deployed/source image IDs, applied `schema_migrations`, backup receipt and incident time. Do not rerun seeds or destructive down migrations as a diagnosis step.
2. Determine the boundary: PostgreSQL transactional DDL rolls back that migration, but earlier migrations in the same release may already be committed. Concurrent-index/nontransactional migrations and external side effects require individual inspection.
3. Rehearse a forward fix on a fresh restore. A failed, unrecorded transactional migration can be corrected; an already-applied migration requires a new forward migration. Test application/data compatibility, encrypted reads, tenant boundaries and private uploads before reopening.
4. If restoration is required, restore to a new database and isolated file root, validate them, then deliberately repoint the reviewed application release. Keep the failed DB intact. Changing code back does not itself reverse database changes. Stop old writers before switching and reconcile any writes after the backup's snapshot time; record actual data loss and resulting customer/rights-request follow-up.

## Real offsite restore procedure

Use a recovery workstation/isolated network with an authorized reader role and escrow access. An encrypted dump is trusted executable database input, not a safe format for arbitrary user uploads. Select a known-good pre-incident object version and matching receipt from the separate account, not just an application host's pointer.

Retrieve the versioned `*.receipt.json` with AWS CLI into a private evidence directory. Record the selected receipt version and expected owner. Export tool configuration via a restricted env file:

```text
BACKUP_S3_BUCKET=<recovery-bucket>
BACKUP_S3_PREFIX=nexus/production
BACKUP_S3_EXPECTED_OWNER=<12-digit-recovery-account>
RESTORE_DATABASE_URL=<isolated-postgres-url-with-new-db-name-nexus_restore_drill123>
RESTORE_CONFIRM_DATABASE=nexus_restore_drill123
RESTORE_PRIVATE_KEY_FILE=/run/secrets/recovery-private.asc
RESTORE_PASSPHRASE_FILE=/run/secrets/recovery-passphrase
RESTORE_UPLOAD_DESTINATION=/recovered/files
RESTORE_REPORT_PATH=/evidence/restore.json
RESTORE_WORK_DIRECTORY=/scratch
```

```sh
bin/recovery restore /private/evidence/selected-receipt.json
```

The tool fetches the exact encrypted S3 version, verifies its receipt checksum, decrypts in a private scratch directory, rejects traversal/symlinks/duplicates/oversized archives, verifies every file hash and creates a **new** database named `*_restore_<id>`. It has no drop/force path. `createdb` fails for any existing DB, and restore runs with exit-on-error in a single transaction. It verifies table counts/schema versions against the original snapshot, restores local files, and rewrites only restored Active Storage service names to `local`. It never overwrites source uploads or reconnects them to a source bucket. Failed destinations are preserved for inspection. The selected receipt and matching encryption key must both be available.

Build the standalone tool with `docker build -f Dockerfile.backup -t nexus-recovery-tools .`. `Dockerfile.backup` provides the standalone tool image with PG16/GPG/AWS CLI for a recovery workstation; use a matching client version for your deployment, mount private keys read-only, pass secrets with an env file and use an empty capped scratch volume. The tool image runs as UID 10001; match the mounted secret/evidence permissions or run with the authorized workstation UID. Never make private keys world-readable to fix a mount. Do not print the env file or pass database passwords as command-line arguments. `RESTORE_LOCAL_FILE` supports a locally retrieved encrypted bundle; the same checksum/decryption checks still apply. `RESTORE_MAX_BYTES` bounds extraction (default 100 GiB); GPG output is bounded separately. Restore credentials should be scoped to the isolated recovery server, not a production superuser.

Before starting an application, create a restore-only environment with `RAILS_ENV=production`, `DEPLOYMENT_TIER=restore`, isolated DB/Redis/files, `LOCAL_STORAGE_ROOT` pointing to the recovered files, original escrowed encryption/signing configuration, local Mailpit capture and outbound network denial. The same nonproduction boot checks reject common live provider credentials. Do not run workers, copy old Redis queues or point external integrations at production. Mount the evidence report and run:

```sh
bundle exec rails recovery:verify
MIGRATION_REHEARSAL=true bundle exec rails db:migrate
bundle exec rails recovery:verify
```

The verifier checks vault, workspace/Keka/rights-request and Operations decryption, user memberships, tenant FK integrity, every recovered blob, and pending migration state. It updates the report without emitting plaintext content. It requires a matching successful restore report and a disposable restore-named database. Database/file success is reported separately from application checks; `external` upload mode still requires separate provider recovery and cannot be treated as complete.

Before activation, manually verify sign-in/MFA, cross-tenant denials, an authorized and denied download, critical project history, and an operator privacy case. Reconcile post-snapshot offboarding/deletions/rights requests from the incident log; an old backup can resurrect revoked access or deleted records. Revoke restored sessions/MCP tokens/support grants and pending invitations through reviewed management tooling before allowing sign-in. Review queued deletions, scheduled notifications and stale resource operations before starting workers. Rotate compromised provider credentials if relevant. Re-provision private storage deliberately if returning to cloud storage; the drill's blob metadata intentionally points to isolated local files. Record checks and obtain the incident owner's activation approval. This repository does not automatically promote a restored DB or claim these human/provider checks passed.

## Repeatable synthetic evidence

Run against a local disposable PostgreSQL server/account with CREATEDB permission and installed PG clients/GPG:

```sh
RECOVERY_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost/postgres \
  bundle exec ruby test/recovery/toolkit_test.rb
RECOVERY_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost/postgres \
  bundle exec ruby bin/recovery-drill
```

The scripts create random fresh fixture databases only, use independently generated fixture keys and data, restore encrypted records and file bytes, reject a wrong application key, check sequence continuity and corruption/overwrite protection, exercise a local fake S3 contract, verify migration receipt guards, then rehearse a failed transactional migration followed by a forward fix. Generated fixture databases and private keys are removed; restricted reports remain under ignored `recovery-artifacts/`. Failed synthetic subprocess output stays in that private directory for diagnosis. The workflow runs monthly/on relevant changes and uploads only the successful synthetic JSON report. Its report explicitly says `synthetic_only: true` and `offsite_exercised: false`: it is not evidence that production S3 permissions, escrow access, inboxes, large datasets or four-hour recovery are proven.
