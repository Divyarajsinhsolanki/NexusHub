# Workspace memberships and authorization

Each account belongs to one company in this release. `User.workspace_id` stays its home tenant; there is no workspace switcher or cross-company account linking. `WorkspaceMembership` is the explicit access record, with `active` or `suspended` status. Unverified accounts still require email confirmation; membership activation does not verify an email or unlock a locked account.

## Data and migration

Migration `20270902000000` creates one active membership per existing user while preserving the original workspace, account status, roles and projects. Existing locked accounts remain locked. It does not split legacy merged data or promote anyone to owner.

Database constraints enforce one membership per user, membership in that user's home workspace, valid status, and a matching membership for every user-role assignment. Existing mismatched role links cause migration failure and rollback rather than automatic reassignment. Run the tenancy audit and resolve such links from verified evidence first.

For deployment, pause signup/member writes and drain old workers, deploy the code and run `bundle exec rails db:migrate`, then restart app/worker processes before reopening access. Do not run a rolling mixture of the old user-creation code and the new membership constraint. Verify user/membership counts, owner roles and the read-only `bundle exec rails tenancy:audit` report before and after. Rollback removes membership state; preserve the audit and suspended-account list before any rollback.

## Common access policy

Every protected API request requires active membership. Browser sessions, mobile bearer/refresh flows, realtime connect/commands and MCP authentication check the same membership; project/department/task policies also check it. Realtime channel actions establish and restore `Current` context around each subscription/action. Missing membership fails closed; authentication never repairs it implicitly.

`WorkspaceAuthorization` supplies company permission names to both browser and mobile clients. `User#role_names` reads the membership's tenant-scoped role assignments and ignores preloaded/cached roles when membership is inactive. Client permissions improve navigation; server checks remain authoritative.

| Role | Additional company capabilities |
| --- | --- |
| Owner | Manage projects, teams, departments, users, workspace memberships, company admin and controlled support access |
| Admin | Manage projects, teams, departments, invite teammates and company admin; cannot change membership roles/status |
| Project manager | Project and project-member management, subject to per-project access |
| Team leader | Team management, subject to per-team leadership |
| Member | Existing personal/workspace features and people directory; no company administration |

Platform administration is separate from company roles and still depends on server-provisioned `site_admin`; it does not grant company ownership or controlled support access. Project viewer roles, team leadership, operations memberships, demo read-only restrictions and plan limits continue to apply beneath these permissions.

## Management interfaces

- `GET /api/workspace_memberships` lists the current company's memberships. `PATCH /api/workspace_memberships/:id` accepts `{ "workspace_membership": { "role_names": ["member"], "status": "suspended" } }`; either field may be omitted. Role changes or suspension require a company owner. Empty role arrays become `member`; unknown roles/statuses are rejected. User/workspace IDs cannot be reassigned through this API.
- Native equivalents are `/api/v1/workspace_memberships` and `/api/v1/workspace_memberships/:id`, with the normal mobile `{ data: ... }` envelope.
- Existing owner-authorized `PATCH /api/users/:id` supports `user[role_names][]` and `user[membership_status]`. Profile and access changes commit together or roll back together. The People editor's Access tab exposes these controls; suspended users keep their assigned roles and data.
- Session/profile responses include `workspace_membership` and `permissions`; web sessions retain role objects and native sessions retain role strings for compatibility.

Owner mutations lock the workspace and membership and reject removal, suspension, locking or demotion of the last active owner. Another active, unlocked owner must exist first. Generic admin model editing cannot change memberships or role links. Secure invitations and employee offboarding are documented in [workspace_invitations_and_offboarding.md](workspace_invitations_and_offboarding.md).

Suspension revokes existing browser/mobile sessions and MCP tokens in the same transaction; existing session callbacks disconnect affected sockets after commit. Reactivation permits a fresh login and never restores revoked credentials. Scheduled chat and user reminder/push delivery also skip inactive members. System maintenance jobs continue to operate without a user membership.

## Verification

Regression tests cover SQL migration preservation, composite foreign keys, stale role caches, cross-company access, owner/admin/member capabilities, last-owner protection, profile/role rollback, browser/native parity, session/MCP revocation and realtime revalidation. The mobile OpenAPI contract and generated types include the new interfaces.

This step adds company access controls. The prior mixed-workspace recovery procedure still applies, and legacy PDF private-file delivery remains a separate work package.

Privileged MFA and support-grant controls are documented in [privileged_mfa_and_support_access.md](privileged_mfa_and_support_access.md).
