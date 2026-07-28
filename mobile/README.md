# Nexus Hub Mobile

Phone-first Expo React Native client for the Nexus Hub Rails `/api/v1` API. It covers authenticated daily work, project delivery, collaboration, knowledge, PDF, account, and role-gated administration workflows. Public, legal, demo, and metaverse pages open in the authenticated in-app browser.

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
