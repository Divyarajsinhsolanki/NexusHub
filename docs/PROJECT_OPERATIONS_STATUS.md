# Implementation checkpoint

Updated 2026-10-09. Implementation and local verification are complete. No production deployment has been performed.

## Implemented

- Structured configuration, software, services and licences; encrypted write-only secrets; safe comparison and reviewed imports.
- Deployment target snapshots, post-deployment observations and verification, recurring schedules and managed calendar events.
- In-app/email delivery ledger, renewal/reschedule cancellation, periodic scheduling and retry recovery.
- Project membership/revision guards, audit history, generic-admin/MCP/calendar protections.
- Five additive migrations applied to development and test, including notification/user deletion lifecycle support.
- Dashboard navigation, responsive matrix, record drawers, reviewed imports, deployment observations and recurring schedule editors.
- Draft revisions stay pinned through background refreshes; filters respect selected environments, licence coverage and comparison pairs.
- User/operator documentation in `PROJECT_OPERATIONS.md`.

## Verification completed

- Operations backend plus existing activity tests: **63 tests, 506 assertions**, all passing.
- Existing security, MCP, mobile API, workspace, notification and issue authorization regressions: **70 tests, 395 assertions**, all passing.
- After adding workspace removal ordering, the schedule/workspace suites passed again: **24 tests, 167 assertions**, including the new regression.
- Operations forms/workspace/deployment, Planning, browser notifications and Navbar: **30 frontend tests**, all passing.
- `bin/vite build`, `rails zeitwerk:check`, and `git diff --check` pass.
- Real Chrome workflow passed on a project without a sprint: write-only configuration, per-environment comparison, software mismatches, multiple service endpoints and credential links, licence keys/coverage/expiry, deployment execution and verification, recurring schedule edits, reviewed selective ENV import and audit history.
- Chrome mobile checks passed after correcting dashboard tab shrinking; page overflow and matrix layout checked at 390px width.
- The isolated browser-test workspace, temporary credentials/scripts and test servers were removed after verification.

No live infrastructure connection or actual deployment is performed by this feature. Version observations are recorded by members or imported for review. Reminder mail delivery is covered by automated tests; production mail transport and workers require the rollout setup in the main documentation.

Existing chat, PDF and mobile changes predate this feature and must be preserved. Do not discard unrelated modifications.

Local secret setup: a stable key is present only in ignored `.env`, without exposure in tracked files. Production must provision its own stable `PROJECT_OPERATIONS_ENCRYPTION_KEY`, run migrations, and restart web/Sidekiq workers before using encrypted storage and reminders.
