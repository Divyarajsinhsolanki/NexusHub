# Security regressions and release gates

> Current zero-customer rollout exception: see [temporary direct production deployment](prelaunch_direct_production.md). EB auto-deploys successful main pushes without staging, and explicitly opts out of offsite migration-receipt enforcement for now. The stricter staged/backup procedures below describe the configuration to restore before customer onboarding.


The P0 security packages now have a mandatory test catalog at `config/security/regressions.json`. It covers tenancy, memberships/authorization, invitations/offboarding, session revocation, privileged MFA/support access, browser/native protections, private files/PDF isolation, abuse limits, protected integrations, privacy intake and recovery. `bin/security-regressions --list` lists its files; `RECOVERY_TEST_DATABASE_URL=<isolated-local-PG-admin-url> bin/security-regressions` runs them with the existing test database. The recovery tests create/delete only randomly named fixture databases. Run on Linux with PostgreSQL clients, GPG, Bubblewrap, PDF tools and the project Ruby dependencies. Never point test/recovery URLs at production.

The security reporter fails empty or skipped security runs, not just failed assertions. Missing catalog files fail the runner. The CI security job also runs adversarial release-policy and smoke-probe tests. Normal full Rails/JS/mobile tests remain separate gates; a selected security subset is not a substitute for full regression testing. Production PDF sandbox tests are exercised with Bubblewrap instead of bypassing the boundary in CI. Ubuntu 22.04 is selected for those runners to support the required unprivileged namespaces; hosted runner/kernel changes must be reviewed if this fails.

## Required checks

The CI workflow can run on push/PR/manual dispatch or be called directly by the deployment workflow at the same source revision. It requires:

- Full Rails suite, full web Vitest suite, production asset builds, Brakeman and Ruby dependency audit.
- Mobile OpenAPI/generated-contract consistency, TypeScript/Jest, Expo checks/exports and critical dependency audit.
- Explicit security regression contract, including a real isolated PostgreSQL recovery round trip with no skipped tests.
- Full synthetic application restore/decryption/upload verification and migration failure/forward-fix rehearsal.
- Redacted repository-history secret scanning using the pinned Gitleaks container digest.

`Release readiness` depends on every required job and runs even when an upstream job fails. Failure, cancellation or skip blocks it. It uses the actual job results, not presence of a report file. EAS preview builds remain available only through the separate explicit manual boolean option; checking a release does not implicitly queue external app builds. Asset compilation uses non-sensitive fixture mail/host/Redis settings; no application/production credentials are needed in these test jobs. Workflow tokens default to read-only. Test/scan network failures block release rather than being marked successful.

New catalog entries need a specific security invariant and meaningful negative cases. Do not add blanket skip switches, retries that conceal a failure, broad scanner exclusions, synthetic success receipts or a `continue-on-error` for required checks. For a scanner finding, determine whether it is a real credential, rotate/revoke if needed, and document any narrowly scoped reviewed fixture exception. Do not paste secret values in CI artifacts or tickets. Git history may require an approved remediation process; deleting the current file alone does not erase history.

## Promotion policy

`bin/release-gate staging|production` is shared by EB and Compose. It requires a committed clean working tree, a full commit SHA and GitHub evidence. Use `GITHUB_REPOSITORY=owner/repository` and a read-only `GH_TOKEN` or `GITHUB_TOKEN` with Actions/deployment visibility. The CLI uses the fixed GitHub API HTTPS host, bounded timeouts and sanitized errors; unavailable/invalid/denied API evidence fails closed. It does not accept a locally manufactured evidence JSON or an override flag.

A trusted CI workflow run must match the exact SHA/repository and originate from push/manual dispatch, not a fork/PR merge. The newest trusted run must be completed successfully within 24 hours. A newer failed or running result defeats an older success. Rerun CI if evidence expires. Production additionally requires a main-branch CI run and the latest staging deployment for that exact SHA to have a success status within seven days. Its status must link to this repository's successful manual EB deployment workflow for the same SHA; a pasted success status or unrelated workflow is insufficient. This is GitHub-environment evidence, not proof against repository administrators who can rewrite trusted workflows or metadata.

EB first calls the full reusable CI, then the promotion gate. The deployment job still uses the selected GitHub environment, and rechecks evidence after any approval delay before loading AWS credentials. After deployment it runs read-only HTTPS smoke checks: public health/legal/intake pages, the exact live revision/tier and unauthenticated denial of integration, privacy-operator and admin APIs. A redirect/login HTML does not count as release identity. The environment deployment becomes successful only after the smoke step passes; failed smoke checks leave a failed deployment and require investigation, not automatic rollback.

The EB package receives an ignored `.release-revision` file with the checked SHA immediately before packaging. `/api/release_status` publicly returns only this revision and deployment tier, with caching disabled. It does not expose secrets, connection strings, dependency versions or database state. Docker ignores the EB revision file and uses `APP_REVISION`; Compose requires it to equal the gated checkout SHA. Compose checks the same GitHub promotion policy before builds/downtime, then retains the existing fresh-offsite-backup migration preflight and live smoke verification. Directly invoking Docker/EB/SQL outside these entry points bypasses these repository-level controls; restrict infrastructure write access accordingly.

`.ebignore` now excludes recovery data, key exports, Rails master/credential keys and server service-account JSON as well as env files. A successful test gate does not make bundling a secret acceptable. Do not replace these exclusions with a broad archive of the working directory.

## Repository/environment setup

Before using these workflows, configure GitHub branch/ruleset protection to require **Release readiness**, block direct/unreviewed protected-branch writes and require review for workflows, security catalog/tests, scanners/ignore rules, gate code and deployment scripts. Add actual responsible reviewers in CODEOWNERS. Configure production environment required reviewers (prevent self-approval) and protected branch restrictions. These settings cannot be provisioned simply by committing YAML; they have not been changed remotely by this work.

For staging and production environments set `EB_ENVIRONMENT` and `RELEASE_BASE_URL` to the corresponding real EB environment and HTTPS origin; keep separate environment-scoped cloud credentials. Staging environment names must contain `staging`. Set the deployed `DEPLOYMENT_TIER` correctly and preserve the isolation and backup setup from the recovery runbook. Promote the same reviewed SHA to staging, wait for successful CI/deployment/smoke evidence, then dispatch production. Do not create a new commit between staging and production without staging it again. GitHub/API outages and expired approvals/results require repair or re-verification; there is no automatic bypass.

If a release gate fails, inspect the failed job, reproduce locally with the same dependencies/seed and fix the underlying behavior. Keep traffic paused if migration failed, as documented in [the recovery runbook](staging_backups_and_recovery.md). A post-deployment smoke failure does not undo migrations or provider side effects; use the reviewed incident/forward-fix/restore procedure. No deployment, live intake submission, email or remote repository-setting change is performed by implementation tests.

Primary references: [GitHub reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows), [deployment statuses](https://docs.github.com/en/rest/deployments/statuses), and [environment protection](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

## Reviewed historical scan findings

The initial scan identified two commits containing the fixed Docker build-only Keka placeholder, a historical browser Firebase API identifier, and a commented Devise generator example. `.gitleaksignore` contains only those exact commit/path/rule/line fingerprints. There are no whole-path, whole-rule or future-commit exclusions. The Devise example was not an active assignment in that historical file; production boot now rejects its published value if configured as Rails, Devise or JWT signing material. If a deployment ever adopted it manually, provision independent keys and follow the rotation/recovery procedure before reopening. The source exception does not establish that an operator's deployed environment is safe.

Firebase browser API identifiers are intentionally public; configure API/application restrictions and Firebase authorization/App Check as applicable in the provider console. This exception does not cover service-account keys, signing keys or future Firebase findings. No provider setting or live key was changed by this implementation. Secret scanning disables Git text conversions/external diff helpers so encrypted Rails credentials are not decrypted by a repository diff driver during scanning.

The web dependency gate blocks high/critical production-dependency advisories and scanner/network/incomplete-output errors; low/moderate findings remain visible as counts for review. Mobile retains its critical-dependency gate. Dependency fixes in this step update Axios/React Router and patch vulnerable transitive nanoid/source-map/grpc packages; regression checks must run against the updated lockfiles. Vitest concurrency is capped at two workers to avoid resource-contention timeouts while keeping the existing assertions and time limits.


## Dependency and runner requirements

Rails is patched to 8.1.4; JSON and Mail use patched releases, and the Vite development proxy uses rack-proxy 1.0.3. Vite Ruby and vite-plugin-ruby are updated together so production compilation enforces their compatibility check. The mobile lockfile also patches the critical shell-quote advisory; the mobile audit still reports high/moderate findings, which remain visible and require separate dependency remediation. They are not represented as a clean audit.

The Rails security jobs use Ubuntu 24.04 with libvips >= 8.13. On the ephemeral GitHub-hosted test runner only, the job disables the AppArmor user-namespace restriction so Bubblewrap can exercise real PDF isolation. This is not a production host configuration instruction. Missing sandbox dependencies or sandbox execution failures must fail the security contract.

The [Rails Active Storage advisory](https://github.com/rails/rails/security/advisories/GHSA-xr9x-r78c-5hrm) requires patched Active Storage and libvips >= 8.13. If a previous live deployment met its affected-image-upload conditions, follow its credential rotation guidance and the existing recovery/key-rotation runbooks; upgrading source does not establish whether a past deployment exposed credentials. No live exposure assessment or key rotation was performed here.

Brakeman excludes only the installed `mobile/node_modules/` tree of third-party native build scripts. Application services, controllers, recovery and release code remain scanned. Legacy account cleanup and storage advisory-lock queries now bind their values rather than interpolate SQL; no new application warning is suppressed.
