# Secure invitations and employee offboarding

Accounts remain in one company. Invitations never migrate an existing account to another workspace. Owners and admins invite teammates; only owners offboard employees. Admins cannot grant owner roles. Platform administrators use a separate privileged account lifecycle process.

## Invitations

People → **Invite teammate** collects an email, approved workspace roles and optional department/projects. No account or password is created until acceptance. Pending, unexpired invitations reserve seats alongside active members. Duplicate pending invitations and cross-company assignments are rejected.

Each seven-day link contains a random single-use capability. Only its SHA-256 digest is persisted; mail jobs receive encrypted tokens. Links use a URL fragment, and the acceptance page/API disable caching. Resending rotates the capability, renews the expiry and rechecks seat capacity. Revocation invalidates it immediately. Acceptance locks the company and invitation, revalidates the sender's current authority and resource scope, consumes the reservation and activates the account in one transaction. Failed acceptance rolls back consumption. The recipient chooses their password; existing same-company suspended accounts must prove their existing account password or authenticated identity. An account in another company is rejected.

The old `POST /api/users` and native counterpart return **410 invitation_required**. Generic admin editing cannot create users or edit invitation/access-event models. Native management is available from More → People → Invitations and offboarding; email acceptance uses the public web page.

## Offboarding

People → **Offboard** shows retained records and required ownership transfer. Owners type **OFFBOARD** and choose an active, confirmed successor where needed. The operation is transactional and protects the last active owner. Project/team/department/operations/group-chat responsibilities transfer; original authorship and work records remain intact. Private group-chat ownership requires a successor already participating in that chat; other restricted resources also enforce their existing access requirements.

Membership becomes suspended with an offboarding timestamp. Web/mobile sessions, refresh credentials and MCP tokens are revoked. Project/team and private conversation participation are removed while history remains stored. Pending messages and PDF work are cancelled/failed, pending invitations issued by or addressed to the employee are revoked, live call participation is removed and hosted calls end. Repeated offboarding returns the existing receipt and retries pending/failed media cleanup.

External call-provider cleanup runs asynchronously. Its receipt shows pending, failed or completed; provider failure does not restore application access. Retry cleanup through the offboarding dialog after resolving the provider issue. Rejoining is blocked until pending/failed cleanup finishes. A fresh invitation is required to rejoin; the old access editor cannot silently reactivate an offboarded account. Rejoining restores only the invitation's explicit roles/projects, never old private conversations, team access, credentials or transferred ownership.

## Setup and rollout

Run `bundle exec rails db:migrate` for migrations `20270903000000` and `20270904000000`; these retain existing records. Deploy application and workers together after draining old workers and pausing membership/invitation writes. Run `bundle exec rails tenancy:audit` before reopening writes. Configure `action_mailer.default_url_options` to the trusted public host (HTTPS in production), SMTP/delivery settings and a worker processing `mailers` and `default` queues. Invitation emails are not delivered without a running worker. The interface reports queued, sent or failed delivery, with resend/revoke controls. Keep the LiveKit provider available for call cleanup. No production publishing or real invitation sending is part of local verification.

Workspace access events record invitation lifecycle and offboarding receipts. This is access removal with retained history, not account erasure; account deletion/retention remains a separate lifecycle.

## Verification

Regression coverage includes acceptance/replay, token rotation/expiry, stale mail jobs, rollback, seat reservations and concurrent acceptance, foreign-resource rejection, current sender authority, rehire account proof, preserved project access removal, session/MCP revocation, ownership transfer, explicit confirmation, retained chats and media cleanup failure/retry. Web and native tests cover management controls, authorization visibility and API destinations.
