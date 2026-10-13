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
