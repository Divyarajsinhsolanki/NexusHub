# Department features on web and mobile

| Feature | Web | Mobile |
| --- | --- | --- |
| Dashboard and workload | Counts, search, workload table | Counts, virtualized member list |
| Head / manager / member roles | Head selector and member role selectors | Native head and role selectors |
| Goals | Create/edit/delete, progress, due date, complete/archive | Native editor and date picker; same actions |
| Announcements | Create/edit/delete, pin, paginated comments, comment removal | Native editor, comments sheet and virtualized comments |
| Resources | HTTPS document links and written onboarding guides | Same content and external link opening |
| Reports | Date filters, completed tasks, current overdue work, project progress, personal logged hours, project CSV download | Native date filters, same metrics, project CSV text through native share |
| Join/transfer requests | Create, view, cancel, approve/reject | Same actions with confirmations |

Web sections live in Department Details. Mobile Department Details links to a dedicated workflow screen with Goals, Announcements, Resources, Requests, and Reports.

## Permissions and data boundaries

Workspace owner/admin manages department details, head assignment, membership, roles, content, and approvals. A head manages membership, roles, content, and approvals. Department managers manage content and membership, but cannot move users from another department through direct membership assignment, assign roles, or resolve other users' requests. Members read department content and reports, comment on announcements, and delete their own comments. Nonmembers can submit and view their own membership requests; they cannot read private department content. Demo accounts are read-only.

Department roles never grant workspace or project roles. Dashboards/reports preserve `Project.accessible_to` and `Task.visible_to`, so counts differ by viewer. Active allocation totals use running projects and declared membership percentages; they are not calendar availability or productivity scores. Assigned-user takes precedence over developer for task workload. Done/completed/closed/cancelled tasks are excluded from open workload.

Existing work-log access remains personal-only. Reports show the viewer's logged hours, never another member's private logs. Completed tasks in a selected period use their last update date because a separate completion-history timestamp is not tracked. Project progress and overdue work are current snapshots; CSV exports current visible project progress, not a complete time-sheet export.

## Approval workflow

A user has at most one pending request across departments, enforced by a partial unique database index. Requests snapshot source membership. Unassigned joins require the destination head; transfers require both source and destination heads. Workspace administrators can approve both. Requesters can cancel; either responsible head/admin can reject. Already resolved requests cannot be resolved again. If membership changes before final approval, the request conflicts and must be cancelled/resubmitted. Requesters must be active, have no scheduled account deletion, and transfer head responsibility first. Final approval atomically updates membership and resets the old department manager designation.

## Performance, editing, and retention

Content, comments, and requests use pagination capped at 50 rows; native lists are virtualized and load subsequent pages on scroll. Client mutations have in-flight guards. Edits send the fetched `lock_version`; stale edits return 409 rather than overwriting newer content. Resource links require HTTPS and reject embedded credentials. CSV text cells escape formula prefixes.

Personal exports include authored department comments and membership requests. Account deletion removes these records and anonymizes the author link on shared department entries; shared department content remains. Deleting a department removes its entries, comments, and related requests and resets members' department roles. API types, OpenAPI, authorization tests, and the privacy notice include the new workflows.

## Release

Run migrations `20270827000000_add_department_role_to_users` and `20270828000000_create_department_workflows` before running the new app code. Existing members default to Member; existing `manager_id` remains Head. Existing department API fields remain compatible; detail adds `dashboard` and `capabilities`, and members add `department_role`.

Both `/api` and `/api/v1` expose department role updates and `departments/:department_id/entries`, nested comments, `requests`, and `report`. Native checkout/build/deployment are separate from these changes. No production deployment or physical-device verification was performed during implementation.
