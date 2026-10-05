# Production Configuration Audit

Checked 2026-10-05 against `nexus-hub-prod` in `ap-south-1`.
Secrets were checked for presence without being included in this document.
See the [complete EB variable inventory](eb-environment-inventory.md) for every
configured environment-property name and whether its value is present.

## Configured

- Rails runtime, secret key, database URL, host allowlist, and public base URL.
- S3 Active Storage bucket and region; bucket versioning is enabled.
- Redis-compatible Valkey for Action Cable and Sidekiq (upgraded from Redis 6
  on 2026-10-06 with a saved legacy snapshot and append-only persistence).
- SES SMTP credentials and sender configuration.
- Firebase web configuration and server project ID.
- reCAPTCHA site key and server secret.
- LiveKit Cloud URL, API key, and API secret.
- Portfolio and demo feature flags and bootstrap controls.
- Certbot email, domains, and HTTPS enable flag.
- `PORTFOLIO_LINKEDIN_URL` added to EB; published profile updated directly.

The current `BASE_URL` is `https://app.divyarajsinh.com`; the apex domain also
serves the app. This affects canonical links and email links, so change it only
when intentionally choosing a different primary domain.

## Remaining Operations

- **Sidekiq worker:** originally absent with 10 queued jobs. On 2026-10-06,
  installed and enabled a systemd worker on the existing instance. Application
  and configuration hooks are added locally and installed in the running app;
  include them in the next application release to retain them after replacement.
  Verified one registered worker, concurrency two, 10 processed jobs, and an
  empty immediate queue. Two old Active Storage analysis jobs retry because
  their referenced files are missing; these records were not deleted.
- **SES production access:** sending is enabled, but `ProductionAccessEnabled=false`.
  Request production access in the SES console for this region before relying on
  delivery to arbitrary users. No test email was sent during this audit.
- **Certificate renewal:** no Certbot renewal timer or cron entry was found.
  Deployment hooks renew certificates during deployments, but a scheduled renewal
  with an Nginx reload is needed for periods without deployments.
- **Database backup retention:** RDS `nexus-hub-prod-db` is available with automatic
  backup retention of one day. Increase it if a longer recovery window is required.
- **Code deployment:** the LinkedIn seed preservation change and the repository's
  HTTPS configuration hook must be included in the next application deployment.
  Installing the hook only on the running instance did not survive the next EB
  configuration update. HTTPS was restored manually afterward; deploy the hook
  with the application source before another environment-variable update.

## Optional Integrations

Sentry, Slack notifications, Google Sheets service-account credentials, external
knowledge-feed keys, and enhanced Expo push authentication are not required for
the app to start. No new external accounts or credentials were fabricated.
`PORTFOLIO_ADMIN_EMAIL` is absent; existing role-based admin access still applies.
`KEKA_API_KEY_ENCRYPTION_KEY` is absent; the app uses `SECRET_KEY_BASE` as its
fallback. Changing that encryption input would invalidate saved Keka credentials.

Configuration presence does not prove an external integration works. Firebase
sign-in, reCAPTCHA challenges, S3 uploads, live calls, and email delivery still need
end-to-end checks with actual user sessions.

## Cleanup

Removed six ignored rotated root-level `pdf_master.log.*` files. Retained the
active PDF log, uploaded files, database/Redis data, dependencies, migrations,
tests, and alternate deployment scripts. No source files were removed without
evidence that they are unused.
