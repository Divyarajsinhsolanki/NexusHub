# Temporary direct production deployment

At the owner's request, the zero-customer application uses the existing production environment without requiring an additional staging EC2 instance or provisioned offsite backups. These code changes do not create AWS resources or change the mobile binary.

## Current flow

1. Push to `main`, or merge a PR into `main`.
2. The existing CI workflow runs its normal tests, security/dependency/secret scans and synthetic recovery checks on GitHub runners.
3. After a successful **push** CI run on `main`, the deployment workflow checks out that exact commit. PR runs cannot deploy or access deployment credentials.
4. The gate still requires recent successful main CI, matching repository/SHA and a clean checkout. A stale commit that is no longer the current main tip is rejected. The workflow explicitly uses `bin/release-gate production --direct-production` to omit staging evidence.
5. Deploy to the existing `nexus-hub-prod` environment, or the production environment's `EB_ENVIRONMENT` variable if set. Verify the live revision and unauthenticated access denials afterward. `RELEASE_BASE_URL` can override the deployed environment's existing `BASE_URL` for smoke checks; no separate URL setup is required if `BASE_URL` is already correct.

Manual dispatch on `main` remains available and requires the same recent successful CI. Failed CI, feature branches, fork/PR runs and invalid/missing evidence cannot deploy. Existing GitHub production-environment approval rules, if configured remotely, still apply; this change does not remove them. Do not push source only to a feature branch and expect a production release.

## Explicit migration exception

`.ebextensions/01_rails.config` sets `PRELAUNCH_ALLOW_UNBACKED_MIGRATIONS=true` for this temporary EB rollout. With the production tier, the migration preflight warns and omits the offsite-backup-receipt requirement. This allows migrations against the existing test/demo database without provisioning backup infrastructure first. **A failed or destructive migration may lose existing test/demo data; this flag does not provide rollback or recovery.** Schema migrations, application bootstrap, application authorization/encryption and rollback restrictions remain in place. Existing application/database/storage/email secrets still need valid configuration.

Outside this EB setting, unbacked migrations remain disabled by default. The standard `bin/release-gate production` and Compose deployment retain their staging requirements. The backup toolkit, isolated staging configuration and recovery procedures remain available for later adoption; synthetic CI recovery fixtures do not create AWS resources or prove recovery of the live application.

## Before real customers

- Provision/test offsite backup and restore, then set `PRELAUNCH_ALLOW_UNBACKED_MIGRATIONS=false` in both the EB source configuration and any explicit environment override.
- Restore staged promotion: remove `--direct-production` and reinstate a staging deployment flow and successful exact-commit staging evidence before production. The strict policy remains the gate's default.
- Finish the deployment, legal and legacy-data checks in the other runbooks before accepting confidential customer data.

This is deployment-only work. No APK rebuild is needed, and no EAS build or OTA update is triggered by this workflow change. Nothing is pushed or deployed merely by editing these files.
