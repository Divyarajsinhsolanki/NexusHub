# Company isolation and merged-data recovery

New web/mobile registrations and first-time Google sign-ins create distinct private workspaces with an owner and Starter trial. A company name or matching email domain never grants access to an existing workspace. Existing users keep their current workspace; staff provisioning must use the authenticated company member flow.

The historical consolidation migration is now a no-op for environments where it has not run. Editing it does not restore an already-migrated database. No automatic split or production data update is included.

## Recovery gates for previously merged records

1. Establish whether migration `20270729000000` ran; inspect migration history, the legacy `private-workspace`, and surviving record ownership with read-only queries. Freeze acceptance of independent companies' confidential data into that workspace pending recovery.
2. Restore a pre-consolidation backup into an isolated environment. Inventory original workspace IDs, users, roles, and every table with `workspace_id`. Retain an evidence-based mapping of original record IDs to companies. Collision-name suffixes and email domains alone are insufficient evidence.
3. Reconcile post-merge creations using verified company ownership and audit history. Track ambiguous records and cross-company associations for explicit review; do not guess ownership or copy ambiguous data to tenants.
4. Rehearse recovery on the isolated copy. Validate row counts, all associations, attachments and storage access, roles, search indexes, exports, background jobs, and web/mobile/realtime denial of cross-company access. Check shared conversations and notifications for mixed-company participants.
5. Produce a concrete approved recovery manifest and rollback plan with a fresh backup. Execute production recovery only with separate explicit authorization. Revoke affected sessions and invalidate caches before reopening access.

Until recovery is verified, the existing shared workspace remains a mixed legacy tenant. Isolated future signup does not establish confidentiality for data already merged there.

## Read-only inventory command

Run `RAILS_ENV=staging bundle exec rails tenancy:audit` against an isolated restored database (or choose the configured environment). Redirect stdout to a protected JSON file for comparison with the pre-consolidation backup. The command uses a read-only, repeatable-read PostgreSQL transaction: it neither creates tenants nor reassigns records.

The report includes workspace IDs/names, consolidation migration history, row counts for every table with `workspace_id`, missing/orphan workspace counts, and cross-workspace database foreign keys. It excludes user emails and record contents. Treat workspace names and IDs as internal information.

`consolidation_migration_recorded: true` does **not** prove the historical merge ran: the preserved migration version now also runs as a no-op. Likewise, `integrity_issues: 0` checks reference consistency, not ownership: merged companies can have consistent references inside the same legacy tenant. Polymorphic/undeclared relationships, storage, queues, caches and realtime still need review.

Compare reports before and after a rehearsed migration, then retain the reviewed manifest with explicit original record IDs, destination workspace IDs, ownership evidence, dependency order, expected row counts, unresolved records, and rollback backup identity. Stop the rehearsal on unresolved ownership or mismatched associations. Do not derive a company mapping from signup names or email domains.

## Registration invariants

- One new private workspace and one new owner account commit together; any validation or role-assignment failure rolls both back.
- Public registration cannot target a persisted workspace or promote an existing member. Existing-account sign-in preserves its workspace and roles.
- Company names are trimmed, limited to 120 characters on creation, and never used as an invitation or access credential. Older API clients may omit the name; they still receive a unique private workspace.
- Caller-supplied workspace IDs, roles and platform-admin flags are ignored by the signup APIs. Platform administrator provisioning remains controlled by server configuration.
- Signup requires email verification before password login. Mail delivery failure is reported without deleting an otherwise valid tenant/account.

Verification: `bundle exec rails test test/services/workspace_registration_test.rb test/services/workspace_tenancy_audit_test.rb test/requests/signup_workspace_test.rb test/models/workspace_scoping_test.rb test/migrations/consolidate_regular_workspaces_test.rb test/requests/auth_flows_test.rb test/requests/mobile_api_v1_test.rb`.
