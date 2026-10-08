# Project Environments & Operations

Open **Projects → a project → Environments**. The workspace is available without
a sprint and shares environment records with Project Vault. Its five sections
cover configuration, software versions, services, licences, and deployments.

## Working with records

- **Variables & configuration:** use a shared key across environments, mark
  required entries, and choose environment-specific or must-match comparison.
  Click a matrix cell to edit it. Empty required values are missing; differences
  between environment-specific values are informational.
- **Software:** record expected and observed versions, observation time/source,
  and verification. Versions use exact comparison, not semantic-version ranges.
  Entering or importing an observation is distinct from confirming it.
- **Services:** link named endpoints and configuration credentials for each
  environment. Authentication belongs in encrypted credential entries. Public
  endpoint URLs cannot contain embedded authentication, query strings, or
  fragments. Link software and licences to the services they support.
- **Licences:** assign an owner, covered environments/services, optional licence
  key, expiry, timezone, and additional reminder recipients. An empty expiry
  means no expiry. Renew the existing record to preserve its change history.
- **Deployments:** maintain a date, environment, owner, recipients, release target
  versions, and execution state. Weekly/monthly recurring schedules create
  independent occurrences in a rolling 90-day window.

Search and environment/pair filters keep comparison focused. Record drawers,
notification links, and managed Planning events all open the same record.
History contains safe metadata and optional change reasons; do not paste
credentials into descriptions, names, endpoints, or change reasons.

Active project members can read. Active members other than viewers can edit.
Workspace administration alone does not grant project access. Deleting an
environment requires first removing or reassigning its operational records.

Reassign deployment, recurring-schedule, and licence ownership before deleting
an account. Owners of historical deployments should be deactivated to retain
release history. Deleting other members removes their personal reminder
deliveries and clears verifier references without deleting release records.
Departed reminder recipients are shown in editors so their selections can be
removed. Reassign an inactive recurring-schedule owner to resume future dates.

## Imports and verification

ENV imports accept assignments, optional `export`, comments, and quoted values.
They perform no shell execution or variable interpolation. Preview shows names
and proposed actions; commit merges selected rows and preserves omitted keys.
New keys default to secret and optional. Existing secrecy, requirements, and
comparison rules survive imports. Raw uploaded files are not stored.

Software CSV imports use the template provided in the UI. Select whether the
file contains expected or observed versions. Review the preview and select
rows before committing. Observed-version imports do not silently replace the
approved baseline. Package manifests and recorded inventories alone are not
proof that a version is installed on a server.

A deployment starts with its own editable version targets. Starting execution
freezes those targets. Mark execution **Deployed**, then record observed versions
collected after completion. Verification requires every target to match, with
fresh observations, before promoting the deployment's targets to the current
environment baseline. An older deployment cannot replace a newer verified
baseline. Empty target lists remain unverified.

## Secret storage

Set `PROJECT_OPERATIONS_ENCRYPTION_KEY` to a securely generated 32-byte key,
encoded as **64 hexadecimal characters**, before writing configuration values
or licence keys. Generate it once in your deployment's secret manager. The
application uses the existing `attr_encrypted` AES-256-GCM implementation with
random IVs and no fallback to another application's secret.

```sh
ruby -rsecurerandom -e 'puts SecureRandom.hex(32)'
```

Back up this key securely with database-recovery procedures. Do not regenerate
it during deployment. Loss or replacement of the key makes existing values
unreadable. Missing/invalid keys and decryption failures preserve stored data
and block affected writes. Never put this key in a `VITE_` variable.

All configuration values are encrypted at rest. Explicitly non-secret values
may be returned for display; saved secrets and licence keys are write-only.
Replacing and clearing are explicit actions. Secret equality is computed on the
server, and saved secret definitions cannot be downgraded to reveal values.
Generic admin CRUD excludes protected operations records. Existing Vault
credentials are not automatically copied or migrated.

## Reminders and calendars

Reminder recipients are the owner plus selected active project members. Both
in-app notifications and email respect the existing calendar-reminder
preference. Operations reminders also generate mobile push, subject to the reminders category, quiet hours, and device notification permissions.

- Licence defaults: 30, 7, and 1 day before expiry at 09:00 in the licence timezone.
  Licences remain valid through their expiry date.
- Deployment defaults: 1 day and 1 hour before the planned time.
- Offsets can be changed or disabled. Creating a record late skips elapsed
  offsets rather than sending a burst of old reminders.
- Renewal, cancellation, rescheduling, and completion invalidate old deliveries.
  Recipients' project access is rechecked at delivery time.

Recurring schedules use IANA timezones and preserve local wall time. Monthly
dates absent from a month are skipped. Repeated DST times use the earlier
occurrence; nonexistent wall times advance by the transition gap. Series edits
affect future unstarted occurrences and retain historical deployments.

Operations records own their calendar events. The Planning screen links back
to Operations for edits; calendar, reminder, admin, and MCP paths cannot mutate
the managed projection directly.

Production's existing Sidekiq process loads two `sidekiq-cron` schedules:
daily occurrence generation and a minute-level reminder sweep. Both are also
enqueued at worker startup. Delivery records persist in PostgreSQL so Redis
enqueue failures and worker restarts can be recovered. Emails are marked sent
after the mail transport accepts them; delivery is retried per channel. A crash
between provider acceptance and database commit can result in a repeated email.

For local reminder testing, run Redis and a Sidekiq worker alongside the web app:

```sh
bundle exec sidekiq -q default -q mailers
```

The `OperationReminderDelivery` ledger records failed deliveries for operator
investigation. Worker errors and safe failure class names provide diagnostics
without credential content.

## API and rollout

The web API lives below `/api/projects/:project_id/operations`:

- `GET /`: consistent snapshot, revision, permissions, records, and summaries.
- `POST /items`, `PATCH /items/:id`, `DELETE /items/:id`.
- `PUT /items/:id/entries/:environment_id`.
- `POST /imports/preview` and `POST /imports/commit`.
- `GET /history`: cursor-paginated project history.
- Deployment and deployment-series CRUD, plus deployment `transition`,
  `observations`, and `verify` actions.

Mutations require the snapshot revision. A stale revision returns HTTP 409 and
preserves the newer data. Legacy environment CRUD remains compatible and uses
the same lock/audit mechanism. Read responses containing configuration use
`Cache-Control: no-store`.

Deploy additive migrations, provision the stable encryption key, and restart
web and Sidekiq processes. Verify the scheduler jobs are present and the worker
processes the production-prefixed queues. No infrastructure accounts are
connected and this feature does not execute deployments or inspect servers.

Run the operations request/service/job tests, the operations frontend tests,
the Planning tests, and the Vite production build before release.
