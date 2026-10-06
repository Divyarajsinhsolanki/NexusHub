# Nexus Hub Mobile

Phone-first Expo React Native client for the Nexus Hub Rails `/api/v1` API. Logged-out users enter through the native public portfolio; returning users open the authenticated Today dashboard. The app covers daily work, project delivery, collaboration, knowledge, PDF, account, and role-gated administration workflows. Legal, contact, and metaverse pages open in the in-app browser.

Native modules for encrypted SQLite, push, Google sign-in, LiveKit, and PDF rendering require a development or preview build; Expo Go is not supported.

## Setup

```bash
cd mobile
cp .env.example .env.local
npm install
npx expo start --dev-client
```

Set `EXPO_PUBLIC_API_URL` for the device running the app:

- iOS simulator: `http://localhost:3000/api/v1`
- Android emulator: `http://10.0.2.2:3000/api/v1`
- Physical device: `http://<computer-lan-ip>:3000/api/v1`

For a physical device, use the same LAN host for the mobile API and Rails `LIVEKIT_URL`, then run Rails on an accessible interface:

```bash
bin/rails server -b 0.0.0.0
```

Set `EXPO_PUBLIC_ALLOW_INSECURE_DEV=true` only in the local development environment so Android permits HTTP/WS. Preview and production builds reject HTTP, WS, and loopback hosts and must use HTTPS/WSS. If the computer changes networks, update both LAN URLs before reloading the development client.

## Firebase Google Sign-In

Nexus Hub uses native Google account selection, Firebase authentication, and the Rails `/api/v1/auth/google` token exchange. Expo Go cannot run this flow.

In the existing `temppdfmodifier` Firebase project:

1. Enable Google under Authentication > Sign-in method.
2. Register Android package `com.nexushub.mobile` for Preview/Production and `com.nexushub.mobile.dev` for Development. Add each EAS signing credential's SHA-1 and SHA-256 fingerprints, then download a separate `google-services.json` for each package.
3. Register iOS bundle ID `com.nexushub.mobile` for Preview/Production and `com.nexushub.mobile.dev` for Development, then download the matching `GoogleService-Info.plist` files.
4. Copy the Web OAuth client ID and iOS OAuth client ID from Firebase/Google Cloud. The iOS URL scheme is the plist `REVERSED_CLIENT_ID` value.

Set these public values in `.env.local` and in each EAS environment:

```bash
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps....
```

Upload the package-matched files as EAS project variables with file type and secret visibility. The variable name stays the same because each EAS environment stores its own value:

```bash
eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.dev.json --visibility secret --environment development
eas env:create --name GOOGLE_SERVICE_INFO_PLIST --type file --value ./GoogleService-Info.dev.plist --visibility secret --environment development
eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment preview
eas env:create --name GOOGLE_SERVICE_INFO_PLIST --type file --value ./GoogleService-Info.plist --visibility secret --environment preview
```

Repeat the Preview values for `production`. Keep all files outside Git; local development files can be placed in `mobile/.firebase/` and referenced by `GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICE_INFO_PLIST` in `.env.local`. Elastic Beanstalk must define `FIREBASE_PROJECT_ID=temppdfmodifier` so Rails verifies the Firebase token audience.

After adding native credentials, create a new binary:

```bash
eas build --platform android --profile preview
```

An OTA update alone cannot add the native Google configuration.

## Push Notifications

Push schema v2 adds bundled category sounds, Android channels, background actions, and distinct Chat, audio-call, video-call, work, social, and reminder alerts. These are native changes, so build and install a new Development or Preview APK; an OTA update is not sufficient.

Configure FCM v1 credentials for both Android application IDs in EAS, deploy the Rails migrations, then install and sign into a new build. Push v2 is enabled by default and safely falls back to legacy payloads for schema-v1 devices; set `PUSH_V2_ENABLED=false` only for an immediate rollback. Confirm that new devices register `push_schema_version: 2`. Set `EXPO_ACCESS_TOKEN` on Rails only when enhanced Expo push security is enabled. Never place it in `EXPO_PUBLIC_*` variables.

Notification permission is requested only after the in-app explanation. Category switches, privacy-safe previews, quiet hours, and the operating-system settings shortcut are available under More → Settings. The in-app notification feed remains independent from push preferences.

## Verification

```bash
npm run validate:api
npm run generate:api
npm run typecheck
npm test
npx expo-doctor
```

Cached reads and seven-day drafts are encrypted with SQLCipher. Mutations remain online-only. Signing out or switching accounts clears cached workspace records and drafts.

Run the Maestro smoke flow against a seeded test workspace:

```bash
MOBILE_TEST_EMAIL=user@example.com \
MOBILE_TEST_PASSWORD='Password!42' \
MOBILE_TEST_PROJECT='Apollo' \
MOBILE_TEST_DATE='2026-07-28' \
maestro test .maestro/mobile-smoke.yml
```

Additional flows cover recovery, project administration, collaboration, PDF/admin access, sessions, and impersonation in `.maestro/`.

## Internal Builds

Development and Preview are deliberately separate installable apps:

- Development resolves to `Nexus Hub Dev`, package/bundle ID `com.nexushub.mobile.dev`, and URL scheme `nexushub-dev`.
- Preview and Production resolve to `Nexus Hub`, package/bundle ID `com.nexushub.mobile`, and URL scheme `nexushub`.

This allows both Android APKs (and both iOS internal builds) to remain installed at the same time. Their secure storage, sessions, cached data, notification registrations, and deep links are isolated.

Install and authenticate EAS CLI, then create an internal build:

```bash
npx eas-cli build --profile development --platform android
npx eas-cli build --profile preview --platform all
```

For AWS releases, set these public EAS variables in both `preview` and `production`:

```text
EXPO_PUBLIC_API_URL=https://divyarajsinh.com/api/v1
EXPO_PUBLIC_WEB_URL=https://divyarajsinh.com
EXPO_PUBLIC_ALLOW_LOOPBACK=false
EXPO_PUBLIC_ALLOW_INSECURE_DEV=false
```

Set `APP_VARIANT` to the matching environment name for OTA exports, along with `EAS_PROJECT_ID`, public Firebase/Google configuration, and the required native signing credentials. Keep `GOOGLE_SERVICES_JSON` as a secret file for Android builds. Set `GOOGLE_NATIVE_AUTH_ANDROID=true` only in environments whose installed Android binary already includes Google configuration; this preserves Google login during OTA exports where secret files are unavailable.

LiveKit API keys and secrets belong only on the Rails server in Elastic Beanstalk, never in Expo. The authenticated API supplies call tokens and the media server URL. Chat and foreground notifications obtain their authenticated WebSocket URL from `/api/v1/realtime`; background push additionally requires valid EAS FCM/APNs credentials and device notification permission.

Publish Android JavaScript/configuration fixes with `eas update --channel preview --environment preview --platform android`. Restart the installed app to download and apply the update. Repeat for the production channel when appropriate. Native domain associations, plugins, permissions, and Firebase files require a new binary; `development`, `preview`, and `production` channels use app-version runtime gating, so incompatible native changes also require a new app version.

The app stores access and refresh tokens in native SecureStore. Refresh tokens rotate after every use; failed refresh clears the local session.

## Chat And Call Verification

Mobile and web use the same Rails conversations, message receipts, reaction events, and call sessions. Mobile obtains a short-lived WebSocket token from `/api/v1/realtime/token`; no permanent media or WebSocket credentials belong in the app.

`src/realtime/nativeConsumer.ts` adapts ActionCable's browser visibility monitor for React Native while retaining its heartbeat polling. AppState and network recovery are owned by the shared realtime provider. Run its real-consumer regression tests when upgrading ActionCable; do not add browser-global shims to the native runtime.

Before releasing, run `npm run typecheck` and `npm test`, then verify with a real phone and browser:

1. Open a chat, send messages in both directions, and verify the thread stays connected.
2. Background or disconnect the phone, send from the web, then return and verify recovery and receipts.
3. React from either device, retry a failed send, and confirm no duplicate messages.
4. Start audio/video calls from either device, answer or decline on the other, and verify shared call state after leaving a group call or ending it for everyone.

Source changes and commits alone do not update an installed binary. Publish a compatible OTA update or build a new binary only when a release is explicitly requested.
