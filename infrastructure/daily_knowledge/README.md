# Daily workspace Knowledge feed

Publishes three evergreen technical tips and one technical post in **Daily tech** inside Knowledge, shared with all members of the configured private workspace. Fields rotate across Rails, React, AWS, Databases, and Security. Content is labelled AI-generated, not news. Code examples need review/testing.

The existing production Sidekiq worker runs `DailyKnowledgePublishJob` at **09:00 AM IST** (`30 3 * * * UTC`). It also checks on worker startup after 09:00 IST to recover a missed daily run. No extra Lambda, API endpoint, database migration, or server is required.

## Configuration

| Environment variable | Selected value |
| --- | --- |
| DAILY_KNOWLEDGE_ENABLED | true |
| DAILY_KNOWLEDGE_WORKSPACE_SLUG | private-workspace |
| DAILY_KNOWLEDGE_OWNER_EMAIL | solanki.divyarajsinhp@gmail.com |
| DAILY_KNOWLEDGE_MODEL_ID | amazon.nova-micro-v1:0 |
| DAILY_KNOWLEDGE_REGION | us-east-1 |

`configure.py` applies those EB properties and grants the existing EC2 role permission only to invoke Nova Micro in us-east-1. Run using Python with boto3 and configured AWS credentials. It does not change the AWS account plan.

Models can be changed using the environment variables plus corresponding IAM resource permissions. The model must support Bedrock Converse and the generated JSON contract. Other providers may require account activation, an inference profile ID, or different optional inference parameters. Verify in staging first.

## Publication and access

- Workspace row lock and daily run metadata prevent duplicate publication, including concurrent/manual retries.
- Exactly four validated items are stored atomically. Invalid/duplicate output fails without changing the current board. A model/network error leaves existing cards intact.
- Older automatic daily cards become archived; personal cards, bookmarks, and other workspaces remain unaffected.
- Members see shared daily cards through both `/api/knowledge_items` and `/api/v1/knowledge_items`, and may save personal bookmarks. Only the author can archive them. Personal generated cards remain private.
- Previous titles (up to 80) are supplied to avoid repetition; exact duplicate titles are rejected. This does not guarantee semantic uniqueness or factual correctness.
- Maximum 2,000 output tokens per generation; SDK retries once, job retries at 15-minute intervals for at most three attempts. Normal runs make one model call per day. Failed attempts are visible in Sidekiq/application logs.
- Disable future publishing with `DAILY_KNOWLEDGE_ENABLED=false`; existing content remains visible.

## Verification

```bash
bundle exec rails test test/services/daily_knowledge_publisher_test.rb test/jobs/daily_knowledge_publish_job_test.rb test/requests/knowledge_items_test.rb test/models/knowledge_item_test.rb
npx vitest run app/javascript/pages/KnowledgeDashboard.test.jsx
npx vite build
```

Deployment was packaged from production commit `2ac4ef2` plus only the eight feature runtime/dependency files. Other uncommitted local work is excluded. Future normal deployments must include this feature's files to retain it.

## Cost

For 30 normal runs with roughly 1,000 input + 2,000 output tokens each, Nova Micro generation is approximately **$0.00945/month**, before retries and taxes, using published US reference rates ($0.035/M input, $0.14/M output). Prior-topic context can increase input usage. Allow roughly **$0.01–$0.03/month** for model usage for this single workspace. The scheduler uses the existing worker and database; no incremental server subscription. Switching models changes this estimate.

[AWS Nova pricing](https://aws.amazon.com/blogs/machine-learning/effective-cost-optimization-strategies-for-amazon-bedrock/)

## Current access issue

On October 10, 2026 IST, AWS model availability returned `authorizationStatus: NOT_AUTHORIZED` for Nova Micro in us-east-1 and ap-south-1, although agreement, entitlement, and region were AVAILABLE. Converse using both the base model and US inference profile returned `ValidationException: Operation not allowed`. IAM simulation allows InvokeModel. This means generation is not yet working; deployment/schedule alone is not evidence of successful publication. Try Nova Micro in the Playground and contact AWS account support if the account restriction persists. No account-plan upgrade or alternate model was performed.

Production verification confirmed the worker is active (one Sidekiq process), `production:daily-knowledge` is enabled with `30 3 * * * UTC`, and the selected private workspace is configured. A live generation attempt from the EC2 application's credentials returned `Aws::BedrockRuntime::Errors::ValidationException: Operation not allowed`; Knowledge item count remained 18 before/after. No generated batch has been published yet.

Final release: **`knowledge-daily-bebaca03243a`**, verified **Ready / Green** in Elastic Beanstalk. The final artifact's eight feature runtime files match the local implementation. Focused release validation passed **13 Rails tests / 51 assertions**, **5 Knowledge UI tests**, and the isolated production frontend build.

## Mobile notifications

The notification release adds one daily alert per active workspace member, with a custom chime on Android 1.0.3 and a tap that opens the technical post. Global/category opt-out and quiet hours are respected. Failed model calls create no alerts. See [Daily Knowledge push release](../../docs/DAILY_KNOWLEDGE_PUSH.md) for deployment, mobile compatibility, and validation.
