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

For a physical device, run Rails on an accessible interface and permit the development host in the Rails host configuration. Production builds must use an HTTPS API URL.

## Firebase Google Sign-In

Nexus Hub uses native Google account selection, Firebase authentication, and the Rails `/api/v1/auth/google` token exchange. Expo Go cannot run this flow.

In the existing `temppdfmodifier` Firebase project:

1. Enable Google under Authentication > Sign-in method.
2. Register Android package `com.nexushub.mobile`, add the SHA-1 and SHA-256 fingerprints from the EAS Android signing credential, and download a fresh `google-services.json`.
3. Register iOS bundle ID `com.nexushub.mobile` and download `GoogleService-Info.plist`.
4. Copy the Web OAuth client ID and iOS OAuth client ID from Firebase/Google Cloud. The iOS URL scheme is the plist `REVERSED_CLIENT_ID` value.

Set these public values in `.env.local` and in each EAS environment:

```bash
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps....
```

Upload the downloaded files as EAS project variables with file type and secret visibility:

```bash
eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment preview
eas env:create --name GOOGLE_SERVICE_INFO_PLIST --type file --value ./GoogleService-Info.plist --visibility secret --environment preview
```

Repeat the variables for `development` and `production`. Keep both files outside Git; local files can be placed in `mobile/.firebase/` and referenced by `GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICE_INFO_PLIST` in `.env.local`. Render must define `FIREBASE_PROJECT_ID=temppdfmodifier` so Rails verifies the Firebase token audience.

After adding native credentials, create a new binary:

```bash
eas build --platform android --profile preview
```

An OTA update alone cannot add the native Google configuration.

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

Install and authenticate EAS CLI, then create an internal build:

```bash
npx eas-cli build --profile development --platform android
npx eas-cli build --profile preview --platform all
```

Set EAS secrets for `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL`, `EAS_PROJECT_ID`, Firebase/Google, Sentry, LiveKit server credentials, and platform signing credentials. `development`, `preview`, and `production` channels use app-version runtime gating so incompatible native changes require a new binary.

The app stores access and refresh tokens in native SecureStore. Refresh tokens rotate after every use; failed refresh clears the local session.
