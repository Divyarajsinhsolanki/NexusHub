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

Nova Micro currently rejects invocation with `Operation not allowed`; there are no generated daily batches yet. The schedule and notification implementation do not resolve this account restriction. Verify Nova Micro in the Bedrock Playground and resolve account access before expecting daily posts or their alerts. No test content or fabricated daily notifications were inserted into production.
