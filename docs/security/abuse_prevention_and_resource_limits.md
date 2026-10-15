# Abuse prevention and resource limits

Limits apply to web and native aliases. Existing memberships, record authorization, MFA and private file checks remain required. Migration `20270907000000` adds concurrent indexes for reservation and PDF admission queries; it does not change existing records.

## Admission limits

| Work | Actor limit | Workspace limit |
| --- | --- | --- |
| Private downloads and native file-access tickets | 300/minute | 1500/minute |
| Search requests | 60/minute | 300/minute |
| Writes | 120/minute | 600/minute |
| Upload requests (reservation and PUT) | 30/hour | 120/hour |
| PDF mutations | 30/hour | 120/hour |
| Account exports | 5/hour | 20/hour |
| Chat writes | 60/minute | 300/minute |
| MCP messages | 60/minute | 300/minute |
| Invitation writes | 20/hour | 60/hour |
| Integration operations | 20/hour | 60/hour |
| Unattached live upload reservations | 10 files / 250 MiB | 50 files |
| Queued/processing PDF operations | 3 | 12 |
| Concurrent production PDF executions | 1 | 2 (2 across the deployment) |

Authenticated counters use verified database identities, shared across sessions and web/native clients. Client-supplied user/workspace headers are ignored. Fixed-window counters can permit a burst across a window boundary; database admission checks independently protect storage and queue capacity. Upload PUT requests count as upload requests too, so the hourly limit permits 15 reserve/upload pairs per user before other upload requests.

Production requires `RACK_ATTACK_REDIS_URL` or `REDIS_URL`. Counters use an explicit namespace. Redis errors fail closed with 503 and retry guidance, rather than permitting an unmetered request. Prefer a dedicated limiter Redis instance configured to avoid counter eviction; monitor memory and availability. Development uses a bounded process-local memory store; tests inject an isolated counter store. Development counters are not a substitute for production Redis.

Existing IP throttles for login, signup, password reset, confirmation, MFA, invitations and demo startup remain. Added controls cover marketing contact submissions (5/hour/IP), MCP (120/minute/IP), private file delivery (300/minute/IP), and login identifiers across source IPs (30/15 minutes). Account keys contain an email digest instead of the email itself. Login identifier throttling is temporary and does not lock or modify the account. Request IPs come from Rails' trusted-proxy processing; the standalone fallback uses the socket address and ignores forwarded headers. Configure the edge proxy to overwrite forwarded headers and restrict direct access to Puma.

Rate/admission responses use 429 and `Retry-After`. Native errors pass through the existing API envelope. Reads and ordinary operation polling do not consume mutation counters; search and private media have separate read budgets. Account export GET requests do consume the export quota. MCP batches contain at most 20 messages, and each message consumes the authenticated quota, so batching cannot multiply the tool-execution budget.

## Request, content and storage budgets

Before Rails parses a mutation body, middleware checks both declared and actual bytes, including absent/false Content-Length. Accepted bodies use a bounded temporary buffer, removed after request dispatch. Rejected bodies return 413 without invoking the controller. JSON/general bodies are capped at 2 MiB, auth bodies at 128 KiB, contact forms at 32 KiB, raw reserved uploads at 100 MiB, and multipart requests at 110 MiB including overhead. Multipart parsing accepts at most 20 files and 128 parts; nested parameters are limited to depth 32.

Files keep the earlier 100 MiB maximum and smaller feature-specific limits. Workspace storage accounting now includes chat, profile, issue and PDF attachments plus live reservations, not just PDF versions. Shared blobs/snapshots count once per workspace. A database transaction advisory lock serializes reservation/attachment admission without inverting parent-record/workspace lock ordering. Requests cannot select their own workspace for this check. Older over-capacity data is preserved, but adding files requires free capacity. Completed upload reservations remain charged while unattached; abandoned staging is reclaimed by the maintenance commands below.

Chat text is limited to 20,000 characters, with at most 10 files totaling 100 MiB per message, including scheduled messages. Contact names/emails/messages have size limits; CAPTCHA verification has connect/read deadlines. Shared pagination helpers cap page sizes at 100. Endpoints with their own tighter caps retain them.

## PDF scheduling and cleanup

The prior PDF subprocess CPU/memory/file/output/time limits still apply. PostgreSQL session advisory locks cap actual subprocess admission across workers and hosts: one per actor, two per workspace, two globally. Locks release in `ensure` and on database session/process loss. No child process starts while admission is unavailable. API callers receive 429; queued operations retry after 30 seconds instead of occupying a worker or failing simply because another processor is busy. The PDF worker continues to use a separate queue with concurrency one.

The existing Sidekiq Cron registry now schedules `ResourceMaintenanceJob` hourly at minute 17 UTC. It expires stale queued operations and enqueues purge for up to 500 abandoned unattached blobs older than 24 hours per pass. Keep a general queue worker running; maintenance is not left to a manual cron setup. To run queue expiry immediately:

```
bin/rails abuse_prevention:cleanup_pdf_queue
```

This fails queued operations older than one hour and releases source snapshots. It does not interrupt a processing operation with a live lease. Existing processing-lease recovery handles interrupted processing jobs. The existing daily commands remain available for catch-up:

```
bin/rails private_files:cleanup_unattached
bin/rails private_files:cleanup_reservations
```

## Edge and operational verification

The supplied Caddyfile caps bodies at 110 MiB, headers at 32 KB, header reads at 10 seconds and whole upload reads at five minutes. Keep equivalent limits on any alternate ingress. Puma defaults to two production workers instead of inferring an unbounded worker count from host CPU count; set `WEB_CONCURRENCY` and thread counts to fit available memory. Large uploads on very slow connections may need a deliberately reviewed upload deadline. See [Caddy request body limits](https://caddyserver.com/docs/caddyfile/directives/request_body) and [server timeout options](https://caddyserver.com/docs/caddyfile/options#timeouts).

The Ruby body guard bounds parser and temporary-file work; it cannot prevent an upstream server from buffering a body before invoking Rack. Edge deadlines/body limits, restricted origin access, container CPU/memory/PID budgets, and volumetric protection remain deployment requirements. These application limits do not claim to stop network DDoS attacks.

Before rollout: run `bin/rails db:migrate`, then validate the Caddyfile with the deployed Caddy version, verify Redis outages produce 503, exercise aliases and separate sessions against 429 limits, verify simultaneous reservations cannot exceed capacity, and monitor rejection rates, queue age, free disk, storage usage and Redis health. No deployment, production cache flush or external account change is performed by this implementation.
