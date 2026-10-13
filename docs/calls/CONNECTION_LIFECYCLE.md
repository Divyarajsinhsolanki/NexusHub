# Call connection lifecycle

Updated web and mobile clients request `media_confirmation_required: true` when creating a direct/group call or fetching join credentials. Receiving credentials leaves a participant ringing; the media-room connected callback posts `/api/v1/calls/:id/media_heartbeat` (web uses `/api/calls/:id/media_heartbeat`) to mark attendance. Token generation failure never changes attendance. Older clients omitting the flag retain the previous response behavior during rollout.

`CallPresenceSweepJob` runs every minute via the existing Sidekiq cron schedule. It queries LiveKit RoomService using a short-lived room-scoped server JWT, confirms only ACTIVE media participants, and expires joined attendance absent for two minutes. A stale party ends a direct call; a group call ends when no joined party remains. Network, authentication, proxy, and malformed-response failures skip cleanup rather than ending a potentially active call. Background mobile media remains present through the server check, without relying on JavaScript timers. Never-joined meetings retain the existing five-minute timeout and unanswered calls retain the ringing timeout.

Deploy the migration, Rails changes, and restart Sidekiq through the deployment workflow so it registers the new cron. Deploy web and rebuild mobile for the new confirmation behavior. Existing LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET authenticate RoomService; no additional secrets are required. The configured host must expose `/twirp/livekit.RoomService/ListParticipants` as well as the signaling connection.

Reference: https://docs.livekit.io/reference/other/roomservice-api/

Automated coverage includes credentials-versus-attendance, permission denial, failed configuration, server presence, abandoned direct calls, safe lookup failure, retrying failed web end requests, and terminal mobile meeting states. Physical-device background/reconnect verification remains necessary after deployment. No live call or production configuration was changed during local testing.
