# Mobile workflow coverage

Updated: 2026-10-13. This is an action-level release checklist, not a declaration of complete parity. “Working” means an implementation exists and was inspected or covered by automated tests; it does not imply Android/iOS device verification. No section is release-complete until its device checks and missing actions below are resolved.

## Chat and social

| Action | Status | Mobile implementation / evidence |
| --- | --- | --- |
| Search conversations with All / Unread / Direct / Groups | Working | Inbox; combined predicate tests; paginated virtualized conversation list |
| Search posts with All / Mine / Media / Discussed | Working | Inbox; author/message search and predicate tests |
| Newest / Oldest / Most active posts | Working | Inbox; same engagement rule as web, applies to loaded pages; Load more expands results |
| Like, share, authorized post deletion | Working | Inbox; native share; delete confirmation; affected feed/detail cache removal; ownership/deletion test |
| Post and comment authors → profile → direct chat | Working | Inbox, post comments, profile; profile navigation tests; invalid profile empty state |
| Comment creation/deletion and failed-send draft recovery | Working | Post comments; optimistic updates and rollback tests |
| Create direct/group chat and select older workspace members | Working | New conversation sheet with paginated people selector |
| Mute/unmute and hide conversation | Working | Shared action sheet and mute controls; existing conversation action tests |
| Rename/manage members, leave group, roles | Working | Conversation details/actions; existing permission-aware tests |
| Message search, threads, pins, schedules, drafts | Working | Chat tools and message actions; existing focused suites retained |
| Mentions, reactions, receipts, edit/delete, previews | Working | Chat rendering/actions and receipt coordinator; existing focused suites retained |
| Reconnect updates and notification navigation/reply | Working | Realtime coordinator, deep links, background notification actions; existing tests retained |
| Keyboard, long lists, attachments, background push | Missing validation | Must exercise on physical Android; iOS compatibility remains unverified on device |

## Projects and work

| Action | Status | Mobile implementation / evidence |
| --- | --- | --- |
| Project create/edit, access and membership | Working | Project screens, settings and members; existing role/access tests |
| Task creation/edit/status, board and scheduler | Working | TaskEditor, project Kanban and scheduler; existing focused suites |
| Project overview task pagination and older task links | Working | Virtualized project detail; linked task query; load-more guards |
| Sprints, backlog/task import, exports | Working | Project workflows and native file handlers |
| Issues and attachments | Working | Project issues detail/editor |
| Environments, configurations, software/services, operations | Working | ProjectOperationsScreen; existing operation tests |
| Project logs task/developer selection | Working | ProjectTaskLogsScreen; native selectors, paginated task choices |
| My Work tasks and personal work-log create/edit/delete | Working | Work tab; existing WorkLogForm tests; dated links load older pages |
| Planning events/work entries, day navigation, create/detail links | Working | New PlanningScreen; selected-date navigation and demo tests |
| Momentum overdue task links and due-card review | Working | Momentum; existing knowledge review endpoint and targeted cache invalidation |
| Spreadsheet/dashboard editing and 3D project room | Intentionally browser-only | Explicit browser links on project detail |
| Android project selectors, long lists and file workflows | Missing validation | Review APK acceptance pass required |

## Calendar

| Action | Status | Mobile implementation / evidence |
| --- | --- | --- |
| Personal/project event create/edit/delete | Working | FullCalendarScreen; server can_edit checks retained |
| Date/time input on Android and iOS | Working | Separate Android date/time dialogs, iOS datetime picker; Android branch test |
| Recurring event creation | Working | Additional occurrence selector value submitted; regression test |
| Reminder create/edit/delete and Google link | Working | Event editor and existing reminders endpoints |
| ICS import/export | Working | Native file picker/sharing; size/format checks; import feedback; existing Rails endpoints documented |
| Workspace/event access denial | Working | Rails calendar_access and mobile_api_v1 request tests |
| ICS sharing/import on actual Android/iOS | Missing validation | Requires installed app and native file providers |

## Knowledge and PDF

| Action | Status | Mobile implementation / evidence |
| --- | --- | --- |
| Discover, daily/inbox, search and saved collections | Working | KnowledgeScreen and existing tests |
| Save/bookmark, review intervals and due cards | Working | KnowledgeScreen; Momentum shortcut added |
| Archive/delete/history and full article navigation | Working | Knowledge detail and collection actions |
| PDF upload/detail/download/share | Working | PDF library/detail screens; existing tests |
| PDF page rotation/deletion, tool workflows, undo/history | Working | PdfDetailScreen; existing focused suite retained |
| Large PDF/attachment behavior on small phones | Missing validation | Actual device pass required |

## People, teams, departments and skills

| Action | Status | Mobile implementation / evidence |
| --- | --- | --- |
| Directory search/pagination and profile navigation | Working | EntityCollectionScreen and member profile |
| User create/edit/delete with passwords | Working | Permission-gated People form; passwords excluded from persistent drafts |
| Department, job title, phone, bio and birthday input | Working | Expanded People form with department selector |
| User roles and initial project assignment | Working | Native multiple selectors; array payload tests; existing server authorization |
| Upload another user's profile/cover photos | Working | Permission-gated People photo actions; native cropping and multipart upload |
| Team/member roles/status, insights and endorsements | Working | TeamsScreen; existing server endpoints |
| Department create/edit/delete and membership | Working | DepartmentsScreen |
| Personal skills and proficiency | Working | Skills; native proficiency selector |
| Learning goals/checkpoints | Working | LearningGoalsScreen |
| Large role/project/member selectors and denied saves on device | Missing validation | Device plus multiple-role acceptance pass required |

## Vault

| Action | Status | Mobile implementation / evidence |
| --- | --- | --- |
| Personal/project item create/edit/delete | Working | Dedicated VaultScreen; project access guards retained |
| Category display/filter and recent/oldest/title sort | Working | Native selectors; existing Rails filters |
| Environment and username for project items | Working | Project-scoped environment selector, global option |
| Mask credential/token values and explicit reveal/copy | Working | VaultScreen; reveal/hide/copy tests |
| Clear revealed state on blur/background | Working | Focus cleanup and AppState handler |
| Exclude secrets from persisted drafts | Working | Secure field metadata; draft tests |
| Updates/info/media, previews and image upload | Working | Expanded category selector, attachment preview, native image selection; hosted video URLs supported |
| Reveal cleanup, clipboard and failed saves on device | Missing validation | Physical-device acceptance required |

## Settings and administration

| Action | Status | Mobile implementation / evidence |
| --- | --- | --- |
| Theme/profile/preferences, push/privacy/quiet hours | Working | SettingsScreen; existing settings tests |
| Password, sessions and sign-out | Working | Settings/account endpoints; auth tests |
| Export, verified account deletion, ownership transfer/cancel | Working | AccountLifecycle; existing lifecycle tests retained |
| Admin resource list/create/edit/delete and metadata forms | Working | AdminScreen + EntityCollectionScreen, server action permissions |
| Admin password reset and owner impersonation | Working | Admin/OwnerAccess screens; existing permission tests |
| Portfolio management and demo tour | Working | PortfolioAdminScreen / DemoTourScreen; existing suites |
| Website, public legal/contact pages and complex desktop tools | Intentionally browser-only | Website entry; project dashboard/3D links |
| Expired sessions, restricted roles, demo saves and network failures | Working | Existing auth/permission/rollback tests plus Rails request checks; actual-device matrix pending |

## Release checks

- Mobile TypeScript and OpenAPI validation; generated API contract committed with documented existing calendar/work-log endpoints.
- Mobile Jest checks: 75 suites / 273 tests passed, plus 2 calendar/work-log endpoint tests; focused new filters, feed deletion, comment profiles, Vault, Planning, calendar and shared selector/pagination tests.
- Rails request suites: mobile_api_v1 and calendar_access (35 tests, 225 assertions passed).
- No new backend endpoints, deployment, or code push in this change.
- Android preview APK is requested through EAS after automated checks; build outcome and artifact are recorded in the delivery message.
- Physical Android acceptance still required: navigation/back/filter retention, keyboard, long lists, attachments, background push/reply, offline retry, expired sessions, restricted roles, cross-workspace links, demo restrictions, secret reveal cleanup and small screens. No adb-connected device was available during implementation.
- iOS compile/device testing remains pending.

Device validation remains open; sections must not be marked release-complete before that pass. Review remaining web actions as individual workflows, not screen names, in subsequent parity work.
