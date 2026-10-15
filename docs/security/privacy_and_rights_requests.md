# Privacy/legal baseline and rights-request operations

## Delivered workflow

`/legal` identifies the existing configured operator and describes data categories, purposes, audiences, integration providers, account controls, retention limitations, security, processing locations, subscriptions and mandatory-rights qualifications. Signup links the terms and privacy notice before account creation. `/privacy-requests` is independent of portfolio enablement and workspace membership. Web and mobile Settings link to it; former employees and people without accounts can use it.

This is a product baseline, not a determination of which laws apply or a claim of certified compliance. Deployment facts must match the notice. The operator must review jurisdiction, controller/processor roles, customer agreements, vendor contracts, transfers and deadlines before paid launch. There is no new marketing-consent checkbox or claim that submitting a request grants blanket consent.

The public form accepts email, request category and bounded details, plus optional name/region. It does not look up account existence or trust client-supplied user/workspace IDs. It records a random case reference, encrypts the submitted content with `INTEGRATION_ENCRYPTION_KEYS`, and queues a verification email. The notice version is recorded with the submission. Mail jobs receive only a record ID. A queue failure returns an actionable error and preserves the recorded request.

Email verification is an explicit POST using a single-use, signed 24-hour link. GET navigation does not verify. A separate signed tracking link lasts 30 days and works only after verification. Tokens are sent in URL fragments, removed from the address bar on page mount, used in POST bodies and never persisted by this UI. Keep the original email's separate tracking link for subsequent visits. Do not forward it: it grants access to the operator response. Expired links require operator follow-up or a fresh submission; they do not erase an open case.

Public status returns the reference, type, dates, status and requester-facing response; it excludes original submission, address and internal notes. Email possession proves mailbox control only, not ownership of requested records or authority to act for someone else. The form never triggers an export, deletion or permission change.

## Operator handling

Site administrators use Settings → Security → Privacy operator queue. This deliberately excludes ordinary workspace owners/admins and generic database administration. Both queue reads and writes require recent MFA. The API is `GET /api/privacy_request_management` (optional `status` filter, earliest target first, maximum 100) and `PATCH /api/privacy_request_management/:reference`. The default queue contains open cases; closed cases remain available through filters during retention.

1. Monitor the queue each working day, including pending verification and email-delivery failures. Assign a responsible human and backup operator outside the application; this release does not auto-escalate or page staff. Failed asynchronous mail jobs remain in the worker's retry/dead queue. Check them. Never treat email enqueue success as proof of delivery.
2. Record the received date, identify the applicable law and controller, and assess the deadline. The default 30-day target starts at initial receipt, including the unverified period. It is an operational target and is not a universal legal deadline or an automatic extension. The API accepts an ISO-8601 `target_response_at` with an internal note to document a reviewed adjustment. An operator must also act on valid requests received through other channels; the web form is not a mandatory exclusive channel.
3. Verify identity and representative authority proportionately, preferably using an established signed-in/contact channel. Do not request identity documents by default or upload them to this form. Avoid disclosing whether another person's records exist. For employer-controlled records, determine the correct workspace/controller and obtain authority before any disclosure. Do not give workspace admins access to the global queue.
4. Use `in_progress` or `needs_information`, and record a private review/verification basis. For additional information, put clear next steps and a secure contact channel in the requester response. Do not put actual export contents, identification evidence or other people's data in the response: the private tracking link can be forwarded by its recipient.
5. Perform the reviewed action through the existing authorized export, correction or verified account-deletion workflow. Check shared records, legal obligations and other people's rights. Closing a case does not itself perform those actions. `completed` requires an explicit identity/authority review and a response. `declined` requires a reason, including when identity cannot be established. Explain limits and how to follow up or complain where applicable. Closed cases cannot be overwritten through this API; a follow-up can be recorded as a new linked case by reference in the notes.
6. Save the response. A generic email notification is queued with a fresh tracking link; the detailed response stays on the private page. If enqueue fails the review remains saved and the UI reports that no notification was queued. Use the agreed contact channel and repair delivery. Every email verification and operator update records action, status, actor ID (where applicable) and time without plaintext request content. Optimistic locking rejects stale review forms.

Only an active site administrator can operate this queue; maintain an operator account and MFA recovery process. This role is platform-wide and should be restricted to people authorized to handle rights requests. It is independent of time-limited workspace support grants and does not expose the underlying tenant data through the intake API.

## Retention and protection

The daily `PrivacyRequestMaintenanceJob` runs at 02:31 UTC via the existing durable background scheduler. Each pass handles at most 500 records in each category:

- Delete unverified requests older than 7 days.
- Erase encrypted content (address, submission, notes and response) 90 days after closure; keep minimal case metadata and events.
- Delete closed case metadata and events 365 days after closure.
- Keep open cases until resolved; monitor unresolved cases rather than silently deleting them.

These are application defaults. A daily job or large backlog means actual cleanup may occur after the threshold. Backups, mailboxes, worker retry logs and provider logs follow separate schedules; restored backups must have retention cleanup applied before normal use. This implementation has no legal-hold override: assess preservation obligations and adopt an approved retention policy before closing cases that require longer retention. Do not promise backup-wide immediate erasure.

Payloads are purpose-bound to the case UUID, excluded from generic serialization/admin access and included in `secrets:rotate`. Do not retire old encryption keys while retained cases or backups still need them. Parameter logging filters the request envelope and tokens. Public endpoints have small body limits, IP throttles and HMAC-address counters (three submissions per hour per normalized email); production counters use shared Redis and fail closed. Cookie routes retain CSRF and origin checks. Native aliases are public and do not use cookie authentication. No request attachments or arbitrary recipient/operator-routing fields are accepted.

## Deployment and legal inventory

Before enabling the release:

- Apply `db:migrate`; provision `INTEGRATION_ENCRYPTION_KEYS` as described in the protected-secrets runbook.
- Set a trusted HTTPS `BASE_URL`, configure the existing mail delivery provider and sender, run the default worker and scheduler, and verify a full round trip using a controlled test mailbox. No live test messages were sent by implementation tests.
- Set/review `VITE_LEGAL_OPERATOR_NAME`, `VITE_LEGAL_CONTACT_EMAIL`, `VITE_LEGAL_CONTACT_ADDRESS`, and `VITE_LEGAL_CONTACT_URL` with accurate operator/contact details, then rebuild the web assets. The existing personal-site identity remains the default; a SaaS company deployment must supply its own legal identity. Keep a monitored alternative contact available if intake or mail fails.
- Record the actual hosting, DB, backup, file-storage, mail, identity, push, calling, AI, diagnostics and billing vendors; regions; retention periods; DPA/transfer arrangements; purpose and role; and owner/contact for each. The legal page lists supported providers conditionally and does not assert they are all enabled. Confirm that content and feature behavior match the deployment.
- Review the current customer terms, billing/refund disclosure, age/audience, employee/workspace controller responsibilities and complaint route with the responsible legal owner. This change adds notice links; it does not create a versioned contractual acceptance ledger or customer DPA signature process.

Useful primary references for that review: [ICO access-request identity and response guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-of-access/what-should-we-consider-when-responding-to-a-request/) and [MeitY Digital Personal Data Protection Rules](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa). Check applicable jurisdiction and commencement dates; do not equate the app's target date with a legal deadline.

## Verification

Request tests exercise public/native intake, bounded fields, ciphertext binding, email-only verification, invalid/expired/replayed links, purpose separation, private status, mail content, per-address limits, encryption failure, operator/tenant authorization, recent MFA, stale updates, review constraints and retention. UI tests cover submission/error handling, explicit verification under React StrictMode, token removal and operator review. Existing account lifecycle, browser protection, admin and workspace integration tests are regression gates. Mail/provider behavior is mocked; actual inbox delivery and jurisdiction-specific legal review remain deployment responsibilities.
