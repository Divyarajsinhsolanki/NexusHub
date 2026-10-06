# Security and public-site review — 6 October 2026

This review combined passive requests to the public site, local code inspection,
request tests, and Brakeman. Changes are local; production has not been deployed.
It is not a comprehensive penetration test or a claim that every route is secure.

## What the public review actually showed

- `GET /api/users` returns **401** anonymously. A publicly accessible React HTML
  shell at `/users` is not evidence of a public user database. In a browser it
  navigates to the login screen.
- Both HTTP and HTTPS `/users` returned 200. HTTP did not redirect.
- HTTPS already sent HSTS, `X-Frame-Options: SAMEORIGIN`, `nosniff`, and a restrictive
  referrer policy. Observed session/visitor cookies were Secure and HttpOnly.
- CSP and Permissions-Policy were missing.
- Both `/robots.txt` and `/sitemap.xml` exist. Their canonical base currently points
  to `https://app.divyarajsinh.com`, including when requested on the apex domain.
- Workspace scoping fails closed without a workspace. Chat, calls, knowledge,
  calendar and PDF controllers contain resource-specific access checks. These are
  useful existing protections, not proof of complete coverage.

## Fixes in this change

| Area | Confirmed problem | Change |
| --- | --- | --- |
| Browser sessions | JWTs contained only user ID/expiry; copied tokens survived logout and password changes, and locked users could refresh them | Database-backed web sessions, purpose-bound tokens, password fingerprint checks, locked-user checks, server-side logout revocation, fixed seven-day lifetime |
| CSRF | Legacy API used null-session protection despite accepting separate authentication cookies | Reject invalid CSRF for browser writes; preserve bearer-only native clients; rotate Rails session on login/logout and update React's CSRF token |
| Password changes | Profile update accepted a new password without verifying the existing one | Profile update excludes password/UID; the dedicated password-change endpoint remains available; web password reset/change also revokes mobile sessions |
| Issue authorization | Workspace membership alone allowed issue reads, writes and sheet import | Active project members, project owner, or workspace owner/admin required; same checks cover issue search and MCP reads/writes, including project-detail serialization |
| Impersonation | Workspace admins could impersonate higher-privilege users | Block site-admin targets and admin-to-owner/admin impersonation |
| Serialization | An unused legacy profile action serialized the entire User model | Use its explicit profile serializer; exclude web/mobile sessions and MCP credentials from the generic admin table browser |
| Rate limits | Signup limiter targeted user management, not signup; reset/confirmation/Devise aliases were uncovered | Add real web/mobile/Devise paths, normalize `.json` suffixes, return Retry-After, and use shared Redis counters in production (file-store fallback for a single host) |
| Middleware | Cookies and Rack::Attack were each installed twice | Rely on Rails and the Rack::Attack railtie, with regression coverage |
| HTTPS | `assume_ssl = true` made even HTTP look secure, bypassing the redirect | Trust the HTTPS listener's forwarded protocol instead; retain force_ssl and HSTS; HTTPS-only Action Cable origins |
| Headers | No enforced CSP or feature restrictions | Enforce base-uri, object-src and frame-ancestors; modern Permissions-Policy allows first-party camera/microphone for calls |
| Logging | Audit paths/referers could contain reset or cable tokens in their query strings | Use Rails-filtered paths and omit referer query/fragment |
| Discovery/accessibility | App routes used the portfolio title and lacked indexing controls | App title/description, noindex response header/meta, document language; portfolio pages remain indexable |

The issue-access policy is a conservative assumption because no preference was
provided during this review. It does not change the application's overall shared
workspace model or make all project/task data private.

## UI observations

The live `/users` route redirected to `/login`. The login form rendered at
1440×1000 and 390×844 without horizontal overflow. Labels, password visibility,
reset-password and Google sign-in controls were visible; no authenticated UI or
Google sign-in was exercised. Desktop marketing animation occupies substantial
space, so a useful next UI pass is motion/performance measurement and clearer
separation between portfolio navigation and the workspace login, rather than an
unverified redesign.

## Deployment

1. Back up the production database and deploy the migration with the application:
   `RAILS_ENV=production bin/rails db:migrate`.
2. Existing browser cookies deliberately stop authenticating: users sign in again.
   Deploy the updated frontend with the backend so CSRF rotation is understood.
3. Nginx must overwrite `X-Forwarded-Proto` with the actual original scheme.
   The repository's HTTPS listener already sets it to `https`. Check any other
   proxy/CDN path before deploying; incorrect forwarded headers can cause loops.
4. Keep `REDIS_URL` or `RACK_ATTACK_REDIS_URL` available for shared rate counters.
   The file fallback only shares counters within one machine. Redis availability
   must be monitored; a failed cache must not be mistaken for working throttling.
5. Verify HTTP redirects to HTTPS, HTTPS `/up` works, and `/users` has noindex/CSP/
   Permissions-Policy. Smoke-test password and Google login, logout/relogin,
   native bearer requests, uploads/PDFs, calls, and issue access with two users.
6. Periodically purge expired `web_sessions` rows; they cannot authenticate after
   expiry, but should not accumulate indefinitely.

## Remaining priorities

- **Authorization breadth:** scheduling tasks, project management and the generic
  admin console need a separate permission-matrix review. Several routes still
  intentionally operate at workspace scope; public signup joins a shared regular
  workspace. Do not treat that as private multi-tenant project isolation. Decide
  whether signup is a community feature or should create/invite private workspaces.
- **Live connections:** revocation is checked on new HTTP requests/connections.
  Already-connected WebSockets are not forcibly disconnected by this change.
- **CSP:** this is a limited enforced policy, not a strict XSS-prevention policy.
  Add nonce-based script restrictions after testing Firebase, reCAPTCHA, LiveKit,
  PDF workers, external feeds and dynamically loaded assets in a browser.
- **Infrastructure:** private DB/cache networking, origin restrictions, renewal
  scheduling, recovery testing, backups and mail delivery cannot be proved from
  public headers. The existing `production-config-audit.md` records earlier
  operational concerns (SES access, renewal and backup retention); those cloud
  settings were not revalidated or modified in this review.
- **Domain/SEO:** choose the portfolio's canonical origin deliberately. Splitting
  the portfolio and app is optional architecture, not a prerequisite for secure
  authorization. Do not change BASE_URL blindly: email and app links also use it.
- **Responsible disclosure:** add security.txt after choosing a monitored contact;
  no unmonitored address has been invented.

## Validation

- Broad backend request/workspace/middleware suite: 139 tests, 814 assertions,
  no failures/errors. A final focused run after the last changes passed 15 tests
  and 73 assertions, including login/logout CSRF rotation and issue authorization.
- Browser auth/CSRF frontend tests: four files, nine tests, all passing.
- Brakeman reported 29 command-injection warnings, all in vendored
  `mobile/node_modules` build scripts; no first-party app warnings were reported.
  Dependency/build-tool findings have not been represented as resolved.
- No authenticated production data was accessed and no production records were
  changed. Live observations above predate deployment of these fixes.

References: [Rails security guide](https://guides.rubyonrails.org/security.html),
[Rails SSL middleware](https://api.rubyonrails.org/classes/ActionDispatch/SSL.html).
