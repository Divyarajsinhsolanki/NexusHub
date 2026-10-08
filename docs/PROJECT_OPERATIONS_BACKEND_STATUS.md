# Project Operations backend checkpoint

Validated on 2026-10-09. All five operations test files plus existing search/activity tests pass with all five operations migrations applied: **63 runs, 506 assertions, 0 failures, 0 errors, 0 skips**. Existing security, MCP, mobile API, workspace, notification and issue authorization regressions also pass: **70 runs, 395 assertions**. `rails zeitwerk:check` and `git diff --check` pass.

The final workspace removal ordering change and its new regression were then
validated with schedule/workspace tests: **24 runs, 167 assertions**, all passing.
Project operations are removed before account ownership checks during workspace
removal.

```sh
bundle exec rails test test/services/project_operations_test.rb test/requests/project_operations_test.rb test/services/operation_schedules_test.rb test/requests/project_deployments_test.rb test/requests/operations_integration_test.rb test/requests/search_and_activity_test.rb
```

The suite covers encrypted/write-only secrets, safe import previews and errors, secret classification, project/workspace permissions, stale revision rejection, atomic mutations, exact version comparison, explicit observation confirmation, frozen deployment targets, fresh deployment observations, and protection against an older deployment replacing a newer baseline. Schedule coverage includes weekly/monthly recurrence, missing monthly dates, DST gaps/overlaps, licence renewal, reminder cancellation, recipient preferences/access, per-channel retry/deduplication, and worker recovery. Integration tests cover Vault environment compatibility, managed calendar events, admin/MCP protections, and safe reminder links.

Lifecycle corrections added during validation:

- Restoring an earlier licence schedule reactivates its future cancelled deliveries while preserving already-sent notices.
- Changing a recurring schedule away from a weekday and back can generate that weekday again. Superseded cancelled records remain as history; explicit occurrence cancellations stay skipped.
- Deleting an in-app notification clears its delivery-ledger reference without deleting the sent record or causing a repeated notice. The fourth additive migration applies this database foreign-key behavior; development and test databases are migrated.
- An existing deployment can still be completed and verified by an active member after its owner leaves or an assigned recipient becomes inactive. Creation and changed assignments continue to require active members, and reminder delivery still rechecks recipient access.
- The activity feed and upcoming-event count exclude managed operations events after project membership is removed, including records owned by the former member. Ordinary calendar behavior is preserved.
- User deletion clears optional verifier references and recipient-owned reminder deliveries while retaining deployment history. Operational owners cannot be deleted until ownership is reassigned; historical owners should be deactivated. User/admin deletion endpoints return a handled validation error and preserve associations when restricted.

Normal email transport failures retain safe failure-class information for sweep retries. A process failure after provider acceptance but before the database commit can still repeat an email; mail headers carry a stable delivery identifier. No infrastructure discovery or live server verification is performed.

Release setup and API behavior are documented in `docs/PROJECT_OPERATIONS.md`. Provision a stable `PROJECT_OPERATIONS_ENCRYPTION_KEY`, apply migrations, and restart web/Sidekiq processes. The test run emits existing Rails timezone-configuration and Ruby CSV default-gem warnings; neither affects these results. Frontend and wider regression validation are tracked separately by the main implementation task.
