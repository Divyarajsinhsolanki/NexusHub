# Daily Knowledge and chat push notifications

Daily publishing runs at **09:00 AM IST**. A successful atomic batch creates one `daily_knowledge_published` notification per active, unlocked, non-demo member of the configured workspace, including its owner. Retries reuse the daily run and do not create duplicate alerts. Failed generation creates no alerts.

Daily alerts use **💡 Today's tech drop**, the technical post title, a dedicated vibration pattern, and the bundled `nexus_knowledge.wav` chime. Tapping opens the article in Knowledge; the mobile card displays its complete body. Personal bookmarks remain available, and archive controls follow API permissions.

The `knowledge` preference is independent of chat. Existing global opt-out, preview privacy, quiet hours, device status, receipt tracking, and delivery retries remain in force. The new category defaults to enabled without changing stored user preferences.

Chat alerts include sender and conversation, a short text or photo/video/audio/file preview, and the referenced message ID. Four-second bursts deliver the latest notification with a count and latest preview. Reactions have a separate group so they do not replace pending message alerts. Dispatch rechecks membership, mute status, deletion, and notification read status.

## Mobile compatibility

- Android 1.0.3 registers push capability version 3 and includes the custom sound and channel.
- Older capability-version-2 devices receive daily alerts on their existing Work channel/sound.
- Version 1.0.3 uses a separate Expo runtime. Installing its APK is required; an OTA cannot add a native sound to 1.0.2.
- Both foreground delivery and taps invalidate the Knowledge board cache.
- A real phone still needs to verify audible sound, OS notification permissions, background delivery, and tap navigation.

## Validation and release

Backend release: `knowledge-push-502783ad4124`, verified Ready / Green. Both public health endpoints return HTTP 200; Sidekiq is active and `production:daily-knowledge` remains enabled with `30 3 * * * UTC`. Live Rails checks confirm the new category/channel/sound; three active push-device records exist.

OTA updates for runtime `1.0.3`: preview group `373a0070-c379-4945-8053-7b08e0e3fe2b`; production group `5fa2188c-242e-424a-90a1-447912953f69`.

Android build: `84519d8f-e851-4bc4-af3e-f2952b3a88c8`, version/runtime `1.0.3`, preview APK profile, verified FINISHED.

[Download Android 1.0.3 APK](https://expo.dev/artifacts/eas/-S9sN3WI68KnQroRJ4mr55l3MZI-ZaVdKz4I_FLFgkE.apk). The downloaded APK contains the exact custom chime bytes at optimized resource `res/Mi.wav`; its resource table retains the `nexus_knowledge` identifier.

Focused checks cover daily recipient scoping and idempotence, failure rollback, older-device sound fallback, privacy, message burst grouping, dispatch-time mute/deletion, post cache refresh, and navigation to older message context. Release packages contain only the notification changes plus the already deployed daily Knowledge implementation.

## Generation blocker

Historical Nova blocker; superseded by the GPT OSS Responses integration below.

Nova Micro currently rejects invocation with `Operation not allowed`; there are no generated daily batches yet. The schedule and notification implementation do not resolve this account restriction. Verify Nova Micro in the Bedrock Playground and resolve account access before expecting daily posts or their alerts. No test content or fabricated daily notifications were inserted into production.

## Bedrock and scheduler check — 2026-10-13

AWS now documents default model access and API-key authentication. The existing Ruby integration uses the supported Converse API with EC2 role credentials and does not require a console-generated key:

- https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html

A minimal four-output-token Converse request to `amazon.nova-micro-v1:0` in `us-east-1` still returns `ValidationException: Operation not allowed`, both locally and on the production EC2 instance. Model metadata reports ACTIVE and supports ON_DEMAND. IAM simulation of the production role allows `bedrock:InvokeModel` for that model ARN, but simulation does not establish account/service access or exclude every other restriction. The exact AWS-side cause remains unconfirmed. No replacement models were enabled or subscribed to, and no API keys were created.

Production daily generation is enabled, one Sidekiq process is registered, and there are zero `bedrock_daily` runs. A separate scheduler defect put 7,971 jobs in `nexus_hub_production_nexus_hub_production_default`, which the worker does not consume. Cron inferred an already-prefixed Active Job queue and passed it through Active Job's prefixing again. `BackgroundSchedules.definitions` now supplies the logical `default` queue for every schedule. A test exercises the real cron enqueue path and verifies the production prefix occurs once. Deploy and allow the worker hook to restart Sidekiq to refresh those definitions. Existing backlog records were not moved or deleted; review them separately rather than replaying thousands of duplicates. Startup sweep jobs recover current scheduled state.

Suggested support follow-up (not sent):

> Nova Micro (`amazon.nova-micro-v1:0`) in `us-east-1` still returns `ValidationException: Operation not allowed` for a minimal Converse request. The model is ACTIVE and IAM simulation allows InvokeModel on the production EC2 role. The same failure occurs from a local IAM principal and the EC2 application. Please identify the account/service restriction and the required resolution. We need it for a daily engineering knowledge batch: three tips and one technical article, once daily.

The installed local AWS CLI is 1.38.38 and does not expose the newer foundation-model-availability operation. This limitation did not prevent testing the actual Converse request. Use a current CLI/SDK for those new model-access management commands. Do not replace role credentials with a short-lived pasted console key in a scheduled production worker.

## GPT OSS Responses integration — 2026-10-13

Daily publishing now uses `openai.gpt-oss-120b` through `https://bedrock-mantle.ap-south-1.api.aws/v1/responses`. The Ruby adapter signs requests with SigV4 and the normal AWS credential provider chain, so EC2 role credentials refresh automatically. No console API key is required. Responses use `store: false`, low reasoning effort, and a 4,000-token output budget (including reasoning). Incomplete/empty/error responses fail before any cards or notifications are written. Existing atomic publishing, duplicate prevention, and Sidekiq retries remain in place.

Production's `nexus-daily-knowledge` role policy adds only `bedrock-mantle:CreateInference`, restricted to Mumbai. Its reviewed policy is in `config/aws/daily_knowledge_policy.json`. The original Nova permission is retained. The two deployment environment settings must be `DAILY_KNOWLEDGE_MODEL_ID=openai.gpt-oss-120b` and `DAILY_KNOWLEDGE_REGION=ap-south-1`; the repository's Elastic Beanstalk defaults match these values. Existing console settings take precedence, so update them when switching an existing environment.

Applied the policy and requested those two production environment settings. An isolated production-server test loaded the new adapter and used the actual daily prompt/parser: four valid items, 242 input tokens and 789 output tokens, authenticated by EC2 role. That check did not insert cards or send notifications. Eleven focused tests passed (41 assertions), including HTTP/incomplete/empty failures, signed request construction, atomic publishing, and the real cron enqueue path.

Deployment must include both the Responses adapter and the preceding cron queue fix. The user pushes the code; no application release was deployed by this change. Once deployed, the startup daily sweep publishes today's batch if it is after 09:00 IST and no batch exists, and subsequent runs continue at 09:00 IST. Do not replay the duplicate queue backlog.
