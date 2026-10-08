# Chat improvements — web and mobile

## Implemented

- Persistent account/workspace/conversation drafts. Logout clears them; attachments require re-selection after restart.
- Stable send IDs, duplicate-safe retries, and preservation of newer composer text during delayed responses. Failed web sends have a separate retry action.
- Paginated server-side search across message text and attachment filenames, with surrounding-message context.
- Author-only text editing and deletion strictly before 15 minutes, enforced under a database lock. System/deleted messages cannot be changed.
- Deletion retains message IDs/replies but removes content, attachments and reactions. Quotes and notification previews are updated.
- Realtime lifecycle updates, stale-response protection, reconnect recovery, and receipt guards while reading history/search.
- Measured web virtualization, native FlatList windowing, bounded inactive caches, coalesced summary requests and preloaded reaction serialization.
- Responsive message menus, inline editing/errors and mobile keyboard behavior that preserves the reader's position.

## Interfaces

Both web and native conversation-message endpoints support:

| Operation | Interface |
| --- | --- |
| History | GET with existing before_id / limit |
| Search | GET with q, optionally before_id |
| Context | GET with around_id |
| Reconnect | GET with ISO updated_since and after_id; follow meta.next_after_id |
| Edit | PATCH /:id with message.body |
| Delete | DELETE /:id |

Messages add updated_at, edited_at, deleted_at and editable_until. Reply previews carry update/deletion timestamps. Native mutation envelopes are unwrapped by the mobile API client.

message_updated / message_deleted broadcast to the conversation and participants' user streams without incrementing unread counts. Older clients remain API-compatible but need refresh/upgrade for live lifecycle updates.

## Verification

- Rails: 45 tests / 285 assertions covering chat, receipts and calls, including native-bearer/browser-cookie interoperability, workspace isolation, duplicate sends, deletion cleanup, search/recovery pagination and the exact deadline.
- Web: 42 tests passed across chat/launcher, lifecycle state, Cable, mentions, calls and receipts regression suites.
- Mobile: 58 tests passed across chat screen, drafts, realtime, message cache, attachments, receipts and API envelopes; TypeScript and OpenAPI validation passed.
- Browser: two authenticated accounts verified realtime send/edit/delete; inspected desktop, 390px browser and embedded layouts with no horizontal overflow.
- 10,000-message browser fixture: 15 mounted rows; maximum 24.4 ms across 12 input-to-two-animation-frame samples on local headless Chrome/Linux. History prepend anchor drift: 0.21 px.
- Local database: 50- and 100-message history requests each used 10 SELECTs including authentication; search used 9. Standalone serializer/reaction benchmark used 5 SELECTs for both sizes.

Evidence is under tmp/chat-qa/ (ignored, not deployed). Measurements are local fixtures, not production/native-device guarantees. Physical iOS/Android keyboard/media behavior and voice/video media transport were not device-tested; call request/state regressions were tested.

Reproduce query scaling (synthetic data is rolled back; non-local/non-test databases are refused):

```bash
env -u DATABASE_URL RAILS_ENV=test bundle exec rails runner scripts/benchmark_chat.rb
```

## Release order

1. Review/deploy the backend with additive migration 20270820000000_add_message_lifecycle through the existing deployment workflow.
2. Release web assets, then the mobile client; refresh older clients for live edit/delete behavior.
3. Smoke-test two web/native accounts: send, disconnect/retry, old-history search, edit/delete, replies and receipts.

No production deployment or production data change was performed.

## Plan reconciliation after interrupted sessions

Implementation and acceptance verification are separate. The complete plan is **not yet fully accepted** because native-device and full cross-client manual checks remain outstanding.

| Plan requirement | Code / evidence | Status |
| --- | --- | --- |
| Duplicate-safe sends and HTTP/realtime reconciliation | Message API client IDs; web state and mobile cache regression tests | Implemented; automated checks passed |
| Draft text/reply persistence and delayed-send protection | Web chatState/localStorage; mobile chat/drafts/AsyncStorage; logout clearing | Implemented; automated checks passed |
| Read/unread, reconnect and out-of-order events | Web incremental recovery; native reconnect query invalidation; receipt/cache/realtime tests | Automated coverage; full multi-device disconnect matrix pending |
| Reactions, bounded caches and refresh requests | Preloaded backend reactions; bounded inactive message caches; web refresh coalescing | Implemented; constant query count measured; native refresh burst profiling pending |
| Virtualization, pagination, lazy media and reader position | VirtualMessages, native FlatList, attachment renderers | Web measured; native 10,000-message scroll/typing benchmark pending |
| Branding, inbox/composer, menus, loading/errors and responsive layout | Existing chat surfaces polished; desktop/narrow/embedded browser evidence | Browser inspected; physical native keyboard/layout checks pending |
| Sending/retry, connection state, jump-to-latest and accessibility | Both client controls; web keyboard/dialog tests; native accessibility labels | Implemented; full keyboard/screen-reader audit pending |
| Search beyond loaded history, filenames, pagination and context | q / around_id endpoints and client search views | Implemented; backend and browser checks passed |
| Author-only edit/delete before 15 minutes | Locked server mutations; additive lifecycle timestamps | Implemented; exact boundary and authorization tests passed |
| Deleted placeholders and removal from quotes/search/previews/attachments | Detachment and lifecycle propagation on server and clients | Implemented; deletion and stale-event regressions passed |
| Workspace membership, API compatibility and native contracts | Scoped controllers; bearer/cookie interoperability; generated types | Automated checks passed |
| Participant broadcasts without unread changes | Broadcaster and client lifecycle/cache tests | Automated checks and two-browser send/edit/delete passed |
| Attachments, replies, reactions, mentions, groups, notifications and calls | Existing flows retained; focused request/component/state tests | Partial acceptance coverage; not every combination has manual end-to-end evidence |
| Two-account web-to-web and web-to-mobile acceptance | Two-browser realtime evidence; native API versus browser-session regression | Live native-device messaging/receipts/reactions/edit/delete still pending |
| Migrations and deployment steps | AddMessageLifecycle; release sequence above | Prepared only; production untouched |

The 24.4 ms local browser input measurement is not a native-device result or a measured scrolling frame-rate guarantee. Retain these outstanding checks at release handoff rather than treating the earlier green test total as full manual acceptance.
