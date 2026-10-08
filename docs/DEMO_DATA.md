# Demo data coverage

Refresh with `bin/rails demo:seed`. These examples are synthetic, use bundled
media, and do not execute infrastructure operations. Repeated seeds preserve
existing records and attachments.

| Area | Seeded examples |
| --- | --- |
| People | 5 users with distinct illustrated profile pictures and at least 3 skills each |
| Organization | 4 teams and 4 departments, memberships and endorsements |
| Feed | 11 posts, 6 image attachments, comments and likes |
| Projects | Nexus Hub Showcase, Mobile Companion, Knowledge Studio |
| Delivery | At least 3 sprints, 9 tasks, 9 task logs and 3 QA issues per project |
| Project Vault | At least 3 items in each of the 9 categories per project |
| Operations | 6 environment variants per project, configuration, 3 software items, 3 services, 4 licences, release states and 3 recurring schedules |
| Personal Vault | 12 items for the guest: 3 credentials, 3 commands, 3 tokens and 3 notes |
| Daily focus | 3 personal priorities, 4 work logs, 4 daily notes, categories/priorities/tags |
| Planning | 3 guest review events plus the guided tour and managed operational events |
| Chat | 4 group conversations and 3 direct conversations, at least 3 messages each |
| Learning | 4 guest goals with at least 3 checkpoints each |
| Knowledge | Learning notes, 3 examples per News/Technology/Markets topic, 4 prompt histories, 3 archived notes, saved bookmarks and 3 review-due bookmarks |
| PDF library | 3 named records using the bundled sample PDF, available for read-only viewing |

Personal Vault (`/vault`) and Project Vault are different collections. To add
synthetic personal items to an existing account, explicitly select its ID:

```sh
USER_ID=5 bin/rails vault:seed
```

This only adds items with a `Demo:` title prefix and preserves existing items.
It does not copy project credentials or another user's Vault content.

Demo configuration values require the stable operations encryption key before
their first seed. Without it, required values remain empty. Operational reminder
deliveries are disabled for the synthetic examples. Live calls, external feeds,
authentication sessions and operator logs are runtime activity, not seeded data.
Pomodoro state is browser-local and is not a server-side seed collection.
